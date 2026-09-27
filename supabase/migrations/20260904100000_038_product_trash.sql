/*
  Étape 20 du prompt d'amélioration — Suppression réelle des produits
  (§20/§23), même modèle corbeille que clients/fournisseurs/livreurs
  (migration 023) et même correction qu'à l'étape 6 (pas de blocage
  "sauvegarde récente" sur la suppression réversible, seulement sur la
  purge définitive).

  Dépendances déjà vérifiées saines pour l'historique (§52) :
  - order_items.product_id est en ON DELETE SET NULL, et stocke déjà un
    instantané (product_name, product_code, variant_color, variant_size) :
    une purge ne casse jamais une commande historique.
  - product_suppliers, product_variants, product_images sont tous en
    ON DELETE CASCADE vers products : purement des données annexes au
    produit, sans valeur une fois le produit purgé.
  - stock_movements.product_id est aussi en CASCADE : un journal de
    mouvements de stock n'a de sens que rattaché à un produit existant.

  Renumérotation des codes (§19, étape 12) : jusqu'ici le trigger comptait
  TOUTES les lignes de products. Avec la corbeille, un produit "supprimé"
  reste physiquement dans la table (deleted_at renseigné) : il doit sortir
  du calcul des codes P1/P2/P3, et y rentrer à nouveau s'il est restauré.
  renumber_product_codes() est donc mise à jour pour ignorer les lignes
  en corbeille, et un nouveau trigger se déclenche sur le changement de
  deleted_at (pas seulement sur insert/delete).
*/

alter table public.products add column if not exists deleted_at timestamptz;
alter table public.products add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

drop policy if exists "products_delete_admin_only" on public.products;
drop policy if exists "products_delete_authorized" on public.products;

create or replace function public.delete_product(p_product_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.products;
begin
  if not public.has_permission('products.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas supprimer de produit.';
  end if;

  select * into existing from public.products where id = p_product_id and deleted_at is null;
  if not found then
    raise exception using errcode = '22023', message = 'Produit introuvable ou déjà supprimé.';
  end if;

  update public.products set deleted_at = now(), deleted_by = auth.uid() where id = p_product_id;

  perform public.log_audit_event('PRODUCT_DELETED', 'product', p_product_id,
    'Produit déplacé en corbeille : ' || existing.name, to_jsonb(existing), null);
end;
$$;
revoke all on function public.delete_product(uuid) from public;
grant execute on function public.delete_product(uuid) to authenticated;

create or replace function public.restore_product(p_product_id uuid)
returns public.products
language plpgsql security definer set search_path = public
as $$
declare
  updated public.products;
begin
  if not public.has_permission('products.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;
  update public.products set deleted_at = null, deleted_by = null where id = p_product_id returning * into updated;
  if not found then
    raise exception using errcode = '22023', message = 'Produit introuvable.';
  end if;
  perform public.log_audit_event('PRODUCT_RESTORED', 'product', p_product_id, 'Produit restauré de la corbeille : ' || updated.name, null, null);
  return updated;
end;
$$;
revoke all on function public.restore_product(uuid) from public;
grant execute on function public.restore_product(uuid) to authenticated;

create or replace function public.purge_product(p_product_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.products;
  recent_backup_exists boolean;
begin
  if not public.has_permission('products.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;

  select exists(select 1 from public.backups where created_at > now() - interval '1 hour') into recent_backup_exists;
  if not recent_backup_exists then
    raise exception using errcode = '22023', message = 'Aucune sauvegarde récente (moins d''1h) : créez-en une avant de purger.';
  end if;

  select * into existing from public.products where id = p_product_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Produit introuvable en corbeille (déplacez-le en corbeille avant de le purger).';
  end if;

  delete from public.products where id = p_product_id;

  perform public.log_audit_event('PRODUCT_PURGED', 'product', p_product_id,
    'Produit supprimé définitivement : ' || existing.name, to_jsonb(existing), null);
end;
$$;
revoke all on function public.purge_product(uuid) from public;
grant execute on function public.purge_product(uuid) to authenticated;

-- Renumérotation : exclut désormais les produits en corbeille.
create or replace function public.renumber_product_codes()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.products p
  set code = sub.new_code
  from (
    select id, 'P' || row_number() over (order by created_at, id) as new_code
    from public.products
    where deleted_at is null
  ) sub
  where p.id = sub.id and p.code is distinct from sub.new_code;
end;
$$;

create or replace function public.trigger_renumber_products_on_trash()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.renumber_product_codes();
  return null;
end;
$$;
drop trigger if exists trg_renumber_products_trash on public.products;
create trigger trg_renumber_products_trash
  after update of deleted_at on public.products
  for each row execute function public.trigger_renumber_products_on_trash();

-- Un produit déjà en corbeille ne doit plus apparaître dans la boutique
-- publique, même si son status était resté 'ACTIVE' par erreur.
create or replace function public.get_public_products()
returns table (
  id uuid, code text, name text, description text, category_id uuid,
  sale_price bigint, image_url text, status text, in_stock boolean,
  max_orderable integer, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.code, p.name, p.description, p.category_id, p.sale_price, p.image_url,
    p.status, (p.stock > 0) as in_stock, least(p.stock, 10) as max_orderable,
    p.created_at, p.updated_at
  from public.products p
  where p.status = 'ACTIVE' and p.deleted_at is null;
$$;
grant execute on function public.get_public_products() to anon, authenticated;

create or replace function public.get_public_variants(p_product_id uuid)
returns table (id uuid, color text, size text, image_url text, in_stock boolean, max_orderable integer)
language sql stable security definer set search_path = public as $$
  select v.id, v.color, v.size, v.image_url, (v.stock > 0) as in_stock, least(v.stock, 10) as max_orderable
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.product_id = p_product_id and p.status = 'ACTIVE' and p.deleted_at is null
  order by v.color, v.size;
$$;
grant execute on function public.get_public_variants(uuid) to anon, authenticated;

-- Rattrapage immédiat : renumérote en tenant compte de la colonne deleted_at
-- désormais disponible (aucun produit en corbeille actuellement, donc sans effet
-- pratique tout de suite, mais garantit un état cohérent dès l'application).
select public.renumber_product_codes();
