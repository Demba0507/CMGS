/* Phase 4 — Fournisseurs multiples et stock déclaré (cahier des charges §10-13).
   Les tables product_suppliers / supplier_stock_reports existent déjà (migration 008) mais
   n'étaient utilisées par aucune RPC ni interface. Cette migration ajoute :
   1) Le cycle complet déclaration (téléphone) -> vérification -> recalcul du stock public.
   2) La logique fournisseur prioritaire / secondaire avec bascule automatique optionnelle.
   3) La correction du bug identifié en Phase 0 : get_public_products() ne renvoyait qu'un
      booléen, plafonnant silencieusement toute commande chatbot à 1 unité. Elle renvoie
      maintenant une quantité maximale commandable plafonnée (jamais le stock interne exact,
      conformément à la règle « le client ne voit jamais le stock interne détaillé »). */

-- ============ PARAMÈTRE : bascule automatique fournisseur secondaire ============
insert into public.settings (key, value, category, description, is_public) values
  ('commerce.auto_switch_supplier_enabled', 'false', 'commerce', 'Basculer automatiquement vers le fournisseur secondaire si le prioritaire est en rupture', false)
on conflict (key) do nothing;

-- ============ RECALCUL DU STOCK PUBLIC D'UN PRODUIT ============
/* Priorité au fournisseur principal. S'il est insuffisant : par défaut on alerte et on attend
   une décision (comportement actuel, stock ramené à celui du principal, même à 0) ; si
   commerce.auto_switch_supplier_enabled est activé, on bascule sur le meilleur secondaire
   disponible et le produit est réassigné à ce fournisseur pour les prochaines commandes. */
create or replace function public.recompute_product_stock(p_product_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  primary_row public.product_suppliers%rowtype;
  fallback_row public.product_suppliers%rowtype;
  auto_switch boolean;
  product_name text;
  resolved_stock integer;
  resolved_supplier_id uuid;
begin
  select (value = 'true'::jsonb) into auto_switch from public.settings where key = 'commerce.auto_switch_supplier_enabled';
  auto_switch := coalesce(auto_switch, false);

  select * into primary_row from public.product_suppliers where product_id = p_product_id and is_primary = true;

  if primary_row.id is not null and primary_row.verified_stock > 0 then
    resolved_stock := primary_row.verified_stock;
    resolved_supplier_id := primary_row.supplier_id;
  elsif auto_switch then
    select * into fallback_row from public.product_suppliers
    where product_id = p_product_id and coalesce(is_primary, false) = false and verified_stock > 0
    order by verified_stock desc limit 1;

    if fallback_row.id is not null then
      resolved_stock := fallback_row.verified_stock;
      resolved_supplier_id := fallback_row.supplier_id;

      -- La bascule doit aussi se refléter dans product_suppliers.is_primary, sinon l'étoile
      -- « prioritaire » affichée à l'admin reste trompeuse (elle pointerait toujours sur
      -- l'ancien fournisseur alors que le stock vendu provient désormais du nouveau).
      update public.product_suppliers set is_primary = false, updated_at = now() where id = primary_row.id;
      update public.product_suppliers set is_primary = true, updated_at = now() where id = fallback_row.id;

      select name into product_name from public.products where id = p_product_id;
      insert into public.notifications (type, title, message, target_type, target_id)
      values ('SUPPLIER_SWITCHED', 'Fournisseur secondaire activé', 'Le fournisseur principal de « ' || coalesce(product_name, '') || ' » est en rupture : bascule automatique vers un fournisseur secondaire.', 'product', p_product_id);
    else
      resolved_stock := coalesce(primary_row.verified_stock, 0);
      resolved_supplier_id := primary_row.supplier_id;
    end if;
  else
    resolved_stock := coalesce(primary_row.verified_stock, 0);
    resolved_supplier_id := primary_row.supplier_id;
  end if;

  update public.products
  set stock_verified = resolved_stock,
      supplier_id = coalesce(resolved_supplier_id, supplier_id),
      updated_at = now()
  where id = p_product_id;
end;
$$;
revoke all on function public.recompute_product_stock(uuid) from public;
grant execute on function public.recompute_product_stock(uuid) to authenticated;

-- ============ RPC : GESTION DES FOURNISSEURS D'UN PRODUIT ============
create or replace function public.add_product_supplier(
  p_product_id uuid, p_supplier_id uuid, p_initial_supplier_price bigint, p_purchase_price bigint, p_make_primary boolean default false
)
returns public.product_suppliers
language plpgsql security definer set search_path = public
as $$
declare
  created public.product_suppliers;
  has_any_supplier boolean;
begin
  if not (public.has_permission('products.edit') or public.has_permission('suppliers.edit')) then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if p_initial_supplier_price < 0 or p_purchase_price < 0 then
    raise exception using errcode = '22023', message = 'Prix invalide';
  end if;

  select exists(select 1 from public.product_suppliers where product_id = p_product_id) into has_any_supplier;

  /* L'ancien prioritaire doit être désactivé AVANT l'insertion : l'index unique partiel
     product_suppliers_one_primary est vérifié immédiatement (non différable), donc insérer
     une nouvelle ligne is_primary=true pendant qu'une autre l'est déjà lèverait une erreur. */
  if p_make_primary or not has_any_supplier then
    update public.product_suppliers set is_primary = false, updated_at = now() where product_id = p_product_id and is_primary;
  end if;

  insert into public.product_suppliers (product_id, supplier_id, is_primary, initial_supplier_price, purchase_price, declared_stock, verified_stock)
  values (p_product_id, p_supplier_id, p_make_primary or not has_any_supplier, p_initial_supplier_price, p_purchase_price, 0, 0)
  on conflict (product_id, supplier_id) do update set initial_supplier_price = excluded.initial_supplier_price, purchase_price = excluded.purchase_price, updated_at = now()
  returning * into created;

  if created.is_primary then
    perform public.recompute_product_stock(p_product_id);
  end if;

  perform public.log_audit_event('PRODUCT_SUPPLIER_LINKED', 'product', p_product_id, 'Fournisseur associé au produit', null, to_jsonb(created));
  return created;
end;
$$;
revoke all on function public.add_product_supplier(uuid, uuid, bigint, bigint, boolean) from public;
grant execute on function public.add_product_supplier(uuid, uuid, bigint, bigint, boolean) to authenticated;

create or replace function public.set_primary_supplier(p_product_id uuid, p_supplier_id uuid)
returns public.product_suppliers
language plpgsql security definer set search_path = public
as $$
declare
  updated public.product_suppliers;
begin
  if not (public.has_permission('products.edit') or public.has_permission('suppliers.edit')) then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  update public.product_suppliers set is_primary = false, updated_at = now() where product_id = p_product_id;
  update public.product_suppliers set is_primary = true, updated_at = now()
  where product_id = p_product_id and supplier_id = p_supplier_id
  returning * into updated;

  if not found then
    raise exception using errcode = '22023', message = 'Ce fournisseur n''est pas associé à ce produit';
  end if;

  perform public.recompute_product_stock(p_product_id);
  perform public.log_audit_event('PRODUCT_SUPPLIER_PRIMARY_CHANGED', 'product', p_product_id, 'Fournisseur prioritaire modifié', null, to_jsonb(updated));
  return updated;
end;
$$;
revoke all on function public.set_primary_supplier(uuid, uuid) from public;
grant execute on function public.set_primary_supplier(uuid, uuid) to authenticated;

create or replace function public.remove_product_supplier(p_product_supplier_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  target public.product_suppliers;
begin
  if not (public.has_permission('products.edit') or public.has_permission('suppliers.edit')) then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  select * into target from public.product_suppliers where id = p_product_supplier_id;
  if not found then
    raise exception using errcode = '22023', message = 'Association introuvable';
  end if;

  delete from public.product_suppliers where id = p_product_supplier_id;
  perform public.log_audit_event('PRODUCT_SUPPLIER_REMOVED', 'product', target.product_id, 'Fournisseur retiré du produit', to_jsonb(target), null);

  if target.is_primary then
    perform public.recompute_product_stock(target.product_id);
  end if;
end;
$$;
revoke all on function public.remove_product_supplier(uuid) from public;
grant execute on function public.remove_product_supplier(uuid) to authenticated;

-- ============ RPC : DÉCLARATION DE STOCK (SAISIE TÉLÉPHONIQUE) ============
create or replace function public.declare_supplier_stock(p_product_supplier_id uuid, p_declared_stock integer, p_note text default null)
returns public.supplier_stock_reports
language plpgsql security definer set search_path = public
as $$
declare
  created public.supplier_stock_reports;
begin
  if not public.has_permission('stock.edit') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if p_declared_stock < 0 then
    raise exception using errcode = '22023', message = 'Quantité invalide';
  end if;
  if not exists (select 1 from public.product_suppliers where id = p_product_supplier_id) then
    raise exception using errcode = '22023', message = 'Association produit/fournisseur introuvable';
  end if;

  insert into public.supplier_stock_reports (product_supplier_id, declared_stock, reported_by, reported_at, note)
  values (p_product_supplier_id, p_declared_stock, auth.uid(), now(), p_note)
  returning * into created;

  update public.product_suppliers set declared_stock = p_declared_stock, updated_at = now() where id = p_product_supplier_id;

  perform public.log_audit_event('SUPPLIER_STOCK_DECLARED', 'product_supplier', p_product_supplier_id, 'Stock déclaré par téléphone : ' || p_declared_stock, null, to_jsonb(created));
  return created;
end;
$$;
revoke all on function public.declare_supplier_stock(uuid, integer, text) from public;
grant execute on function public.declare_supplier_stock(uuid, integer, text) to authenticated;

-- ============ RPC : VÉRIFICATION DE LA DISPONIBILITÉ ============
create or replace function public.verify_supplier_stock(p_report_id uuid, p_verified_stock integer, p_note text default null)
returns public.supplier_stock_reports
language plpgsql security definer set search_path = public
as $$
declare
  updated public.supplier_stock_reports;
  target_product_supplier public.product_suppliers;
begin
  if not public.has_permission('stock.verify') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if p_verified_stock < 0 then
    raise exception using errcode = '22023', message = 'Quantité invalide';
  end if;

  update public.supplier_stock_reports
  set verified_stock = p_verified_stock, verified_at = now(), verified_by = auth.uid(), note = coalesce(p_note, note)
  where id = p_report_id
  returning * into updated;

  if not found then
    raise exception using errcode = '22023', message = 'Déclaration introuvable';
  end if;

  update public.product_suppliers set verified_stock = p_verified_stock, last_verified_at = now(), updated_at = now()
  where id = updated.product_supplier_id
  returning * into target_product_supplier;

  perform public.recompute_product_stock(target_product_supplier.product_id);
  perform public.log_audit_event('SUPPLIER_STOCK_VERIFIED', 'product_supplier', updated.product_supplier_id, 'Stock vérifié : ' || p_verified_stock, null, to_jsonb(updated));
  return updated;
end;
$$;
revoke all on function public.verify_supplier_stock(uuid, integer, text) from public;
grant execute on function public.verify_supplier_stock(uuid, integer, text) to authenticated;

-- ============ CORRECTION : QUANTITÉ COMMANDABLE VIA LE CATALOGUE PUBLIC ============
/* Remplace le get_public_products() de la migration 003 : le booléen in_stock plafonnait
   silencieusement toute commande (site ou chatbot) à 1 unité. On expose désormais une quantité
   maximale commandable, plafonnée à 10 pour ne jamais révéler le stock interne réel exact. */
drop function if exists public.get_public_products();

create function public.get_public_products()
returns table (
  id uuid,
  code text,
  name text,
  description text,
  category_id uuid,
  sale_price bigint,
  image_url text,
  status text,
  in_stock boolean,
  max_orderable integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.code, p.name, p.description, p.category_id, p.sale_price, p.image_url,
    p.status, (p.stock_verified > 0) as in_stock, least(p.stock_verified, 10) as max_orderable,
    p.created_at, p.updated_at
  from public.products p
  where p.status = 'ACTIVE';
$$;

grant execute on function public.get_public_products() to anon, authenticated;
