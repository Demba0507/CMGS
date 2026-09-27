/*
  Étape 27 (complément, sur clarification explicite de Demba) — Un ADMIN
  (et un employé à qui il l'accorde) doit pouvoir supprimer une commande,
  pas seulement l'annuler. Exemple donné : une commande passée depuis une
  zone où CMGS ne livre pas — l'annulation seule ne suffit pas, il faut
  pouvoir la retirer complètement de la liste active.

  Modèle retenu : le même que partout ailleurs pour les données
  commerciales (§36) — une corbeille réversible, jamais une suppression
  directe sans filet. La commande garde son historique tant qu'elle n'est
  pas purgée définitivement (avec sauvegarde récente exigée, comme
  purge_customer/purge_product...).

  Stock : supprimer une commande qui n'est pas déjà annulée/retournée doit
  aussi libérer son stock réservé — sinon la marchandise resterait
  bloquée indéfiniment pour une commande qui n'apparaît même plus. Même
  modèle "engagé/libéré" qu'à l'étape 22. La restauration ré-engage le
  stock si besoin, en bloquant proprement si le stock n'est plus
  suffisant entre-temps (jamais de survente).

  Nouvelle permission dédiée orders.delete (même schéma que
  customers.delete, products.delete...), accordée à l'ADMIN par défaut,
  délégable à un employé via Dashboard → Employés → Permissions.
*/

alter table public.orders add column if not exists deleted_at timestamptz;
alter table public.orders add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

insert into public.permissions (code, name, description) values
  ('orders.delete', 'Supprimer les commandes', 'Autorise le retrait (et la purge définitive) d''une commande de la liste active')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select r.id, 'orders.delete' from public.roles r where r.code = 'ADMIN'
on conflict do nothing;

-- Un client ne doit jamais voir une commande supprimée dans son propre
-- historique, contrairement au staff qui peut consulter la corbeille.
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders for select to authenticated
  using (deleted_at is null and customer_id in (select id from public.customers where user_id = auth.uid()));

create or replace function public.delete_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.orders%rowtype;
  item public.order_items%rowtype;
  current_stock integer;
begin
  if not public.has_permission('orders.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas supprimer de commande.';
  end if;

  select * into existing from public.orders where id = p_order_id and deleted_at is null;
  if not found then
    raise exception using errcode = '22023', message = 'Commande introuvable ou déjà supprimée.';
  end if;

  if existing.status not in ('CANCELLED', 'RETURNED') then
    for item in select * from public.order_items where order_id = p_order_id loop
      if item.variant_id is not null then
        select stock into current_stock from public.product_variants where id = item.variant_id for update;
        update public.product_variants set stock = stock + item.quantity, updated_at = now() where id = item.variant_id;
      elsif item.product_id is not null then
        select stock into current_stock from public.products where id = item.product_id for update;
        update public.products set stock = stock + item.quantity, updated_at = now() where id = item.product_id;
      else
        current_stock := null;
      end if;
      if item.product_id is not null and current_stock is not null then
        insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
        values (item.product_id, 'RELEASE', item.quantity, current_stock, current_stock + item.quantity, 'Commande ' || existing.code || ' supprimée');
      end if;
    end loop;
    update public.order_supplier_groups set status = 'CANCELLED', updated_at = now() where order_id = p_order_id and status <> 'DELIVERED';
  end if;

  update public.orders set deleted_at = now(), deleted_by = auth.uid() where id = p_order_id;

  perform public.log_audit_event('ORDER_DELETED', 'order', p_order_id, 'Commande déplacée en corbeille : ' || existing.code, to_jsonb(existing), null);
end;
$$;
revoke all on function public.delete_order(uuid) from public;
grant execute on function public.delete_order(uuid) to authenticated;

create or replace function public.restore_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  existing public.orders%rowtype;
  item public.order_items%rowtype;
  current_stock integer;
  updated public.orders;
begin
  if not public.has_permission('orders.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;

  select * into existing from public.orders where id = p_order_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Commande introuvable en corbeille.';
  end if;

  if existing.status not in ('CANCELLED', 'RETURNED') then
    for item in select * from public.order_items where order_id = p_order_id loop
      if item.variant_id is not null then
        select stock into current_stock from public.product_variants where id = item.variant_id for update;
        if current_stock is null or current_stock < item.quantity then
          raise exception using errcode = 'P0001', message = 'Stock insuffisant pour restaurer cette commande (' || coalesce(item.product_name, 'un des produits') || ').';
        end if;
        update public.product_variants set stock = stock - item.quantity, updated_at = now() where id = item.variant_id;
      elsif item.product_id is not null then
        select stock into current_stock from public.products where id = item.product_id for update;
        if current_stock is null or current_stock < item.quantity then
          raise exception using errcode = 'P0001', message = 'Stock insuffisant pour restaurer cette commande (' || coalesce(item.product_name, 'un des produits') || ').';
        end if;
        update public.products set stock = stock - item.quantity, updated_at = now() where id = item.product_id;
      else
        current_stock := null;
      end if;
      if item.product_id is not null and current_stock is not null then
        insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
        values (item.product_id, 'RESERVATION', item.quantity, current_stock, current_stock - item.quantity, 'Commande ' || existing.code || ' restaurée');
      end if;
    end loop;
  end if;

  update public.orders set deleted_at = null, deleted_by = null where id = p_order_id returning * into updated;

  perform public.log_audit_event('ORDER_RESTORED', 'order', p_order_id, 'Commande restaurée de la corbeille : ' || existing.code, null, null);
  return updated;
end;
$$;
revoke all on function public.restore_order(uuid) from public;
grant execute on function public.restore_order(uuid) to authenticated;

create or replace function public.purge_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.orders%rowtype;
  recent_backup_exists boolean;
begin
  if not public.has_permission('orders.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;

  select exists(select 1 from public.backups where created_at > now() - interval '1 hour') into recent_backup_exists;
  if not recent_backup_exists then
    raise exception using errcode = '22023', message = 'Aucune sauvegarde récente (moins d''1h) : créez-en une avant de purger.';
  end if;

  select * into existing from public.orders where id = p_order_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Commande introuvable en corbeille (déplacez-la en corbeille avant de la purger).';
  end if;

  delete from public.orders where id = p_order_id;

  perform public.log_audit_event('ORDER_PURGED', 'order', p_order_id, 'Commande supprimée définitivement : ' || existing.code, to_jsonb(existing), null);
end;
$$;
revoke all on function public.purge_order(uuid) from public;
grant execute on function public.purge_order(uuid) to authenticated;
