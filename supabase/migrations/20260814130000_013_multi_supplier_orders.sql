/* Phase 5 — Commandes multi-fournisseurs (cahier des charges §20).
   order_items porte déjà supplier_id/supplier_price par ligne (schéma d'origine). Cette migration
   introduit un regroupement explicite par fournisseur avec son propre cycle de statut, pour que
   CMGS puisse suivre "sous-commande fournisseur A / B / C" séparément, tout en gardant une seule
   commande visible côté client. Additive uniquement. */

create table if not exists public.order_supplier_groups (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PREPARING', 'READY', 'HANDED_TO_DELIVERY', 'DELIVERED', 'CANCELLED')),
  subtotal bigint not null default 0,
  purchase_subtotal bigint not null default 0,
  item_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, supplier_id)
);
create index if not exists idx_suborders_order on public.order_supplier_groups(order_id);
create index if not exists idx_suborders_supplier on public.order_supplier_groups(supplier_id);

alter table public.order_items add column if not exists supplier_group_id uuid references public.order_supplier_groups(id) on delete set null;

alter table public.order_supplier_groups enable row level security;
create policy "suborders_select_authorized" on public.order_supplier_groups for select to authenticated using (public.has_permission('orders.view'));
create policy "suborders_select_own" on public.order_supplier_groups for select to authenticated
  using (order_id in (select id from public.orders where customer_id in (select id from public.customers where user_id = auth.uid())));
revoke all on public.order_supplier_groups from anon, authenticated;
grant select on public.order_supplier_groups to authenticated;

-- ============ CHECKOUT : REGROUPEMENT AUTOMATIQUE PAR FOURNISSEUR ============
create or replace function public.create_public_checkout(
  p_name text,
  p_phone text,
  p_neighborhood text,
  p_address text,
  p_items jsonb,
  p_payment_method text default 'CASH_ON_DELIVERY'
)
returns table (order_id uuid, order_code text, subtotal bigint, delivery_fee bigint, total bigint)
language plpgsql security definer set search_path = public
as $$
declare
  item jsonb;
  product_row public.products%rowtype;
  customer_id uuid;
  created_order_id uuid;
  created_code text;
  item_product_id uuid;
  item_quantity integer;
  computed_subtotal bigint := 0;
  computed_delivery bigint := 1000;
begin
  if nullif(trim(p_name), '') is null or nullif(trim(p_phone), '') is null or nullif(trim(p_neighborhood), '') is null then
    raise exception using errcode = '22023', message = 'Informations client incomplètes';
  end if;
  if p_payment_method not in ('CASH_ON_DELIVERY', 'ORANGE_MONEY_MANUAL') then
    raise exception using errcode = '22023', message = 'Mode de paiement indisponible';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'Panier vide';
  end if;

  if auth.uid() is not null then
    select c.id into customer_id from public.customers c where c.user_id = auth.uid() for update;
  end if;

  if customer_id is null then
    select c.id into customer_id from public.customers c
    where c.phone = trim(p_phone) and (c.user_id is null or c.user_id = auth.uid())
    order by c.created_at desc limit 1 for update;
  end if;

  if customer_id is null then
    insert into public.customers (name, phone, neighborhood, address, channel, status, last_interaction, user_id)
    values (trim(p_name), trim(p_phone), trim(p_neighborhood), nullif(trim(p_address), ''), 'SITE', 'CUSTOMER', now(), auth.uid())
    returning id into customer_id;
  else
    update public.customers
    set name = trim(p_name), neighborhood = trim(p_neighborhood), address = nullif(trim(p_address), ''), status = 'CUSTOMER', last_interaction = now(), user_id = coalesce(user_id, auth.uid())
    where id = customer_id;
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    item_product_id := (item ->> 'product_id')::uuid;
    item_quantity := (item ->> 'quantity')::integer;
    if item_quantity is null or item_quantity < 1 or item_quantity > 100 then
      raise exception using errcode = '22023', message = 'Quantité invalide';
    end if;
    select * into product_row from public.products where id = item_product_id and status = 'ACTIVE' for update;
    if not found or product_row.stock_verified < item_quantity then
      raise exception using errcode = 'P0001', message = 'Produit indisponible ou stock insuffisant';
    end if;
    computed_subtotal := computed_subtotal + (product_row.sale_price * item_quantity);
  end loop;

  created_code := 'CMGS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.orders (code, customer_id, channel, status, subtotal, delivery_fee, service_fee, total, payment_method, payment_status, delivery_address, delivery_neighborhood)
  values (created_code, customer_id, 'SITE', 'CONFIRMED', computed_subtotal, computed_delivery, 0, computed_subtotal + computed_delivery, p_payment_method, 'PENDING', nullif(trim(p_address), ''), trim(p_neighborhood))
  returning id into created_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    item_product_id := (item ->> 'product_id')::uuid;
    item_quantity := (item ->> 'quantity')::integer;
    select * into product_row from public.products where id = item_product_id and status = 'ACTIVE' for update;
    insert into public.order_items (order_id, product_id, product_name, product_code, quantity, unit_price, supplier_id, supplier_price)
    values (created_order_id, product_row.id, product_row.name, product_row.code, item_quantity, product_row.sale_price, product_row.supplier_id, product_row.supplier_price);
    update public.products set stock_verified = stock_verified - item_quantity, updated_at = now() where id = product_row.id;
    insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
    values (product_row.id, 'RESERVATION', item_quantity, product_row.stock_verified, product_row.stock_verified - item_quantity, 'Réservation checkout ' || created_code);
  end loop;

  /* Regroupe les lignes de la commande par fournisseur : une commande visible côté client,
     plusieurs sous-commandes internes gérées séparément par CMGS (§20). */
  insert into public.order_supplier_groups (order_id, supplier_id, subtotal, purchase_subtotal, item_count)
  select created_order_id, oi.supplier_id, sum(oi.unit_price * oi.quantity), sum(oi.supplier_price * oi.quantity), sum(oi.quantity)
  from public.order_items oi
  where oi.order_id = created_order_id
  group by oi.supplier_id;

  update public.order_items oi set supplier_group_id = g.id
  from public.order_supplier_groups g
  where g.order_id = created_order_id and oi.order_id = created_order_id and g.supplier_id is not distinct from oi.supplier_id;

  insert into public.payments (order_id, method, amount, status) values (created_order_id, p_payment_method, computed_subtotal + computed_delivery, 'PENDING');
  insert into public.notifications (type, title, message, target_type, target_id) values ('NEW_ORDER', 'Nouvelle commande', 'Commande ' || created_code || ' reçue de ' || trim(p_name), 'order', created_order_id);
  insert into public.event_logs (event_type, entity_type, entity_id, description) values ('ORDER_CREATED', 'order', created_order_id, 'Commande ' || created_code || ' créée via checkout sécurisé');

  return query select created_order_id, created_code, computed_subtotal, computed_delivery, computed_subtotal + computed_delivery;
end;
$$;

revoke all on function public.create_public_checkout(text, text, text, text, jsonb, text) from public;
grant execute on function public.create_public_checkout(text, text, text, text, jsonb, text) to anon, authenticated;

-- ============ RPC : SUIVI INDÉPENDANT D'UNE SOUS-COMMANDE FOURNISSEUR ============
create or replace function public.update_suborder_status(p_suborder_id uuid, p_status text)
returns public.order_supplier_groups
language plpgsql security definer set search_path = public
as $$
declare
  previous_status text;
  updated public.order_supplier_groups;
begin
  if not public.has_permission('orders.edit') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if p_status not in ('PENDING', 'PREPARING', 'READY', 'HANDED_TO_DELIVERY', 'DELIVERED', 'CANCELLED') then
    raise exception using errcode = '22023', message = 'Statut invalide';
  end if;

  select status into previous_status from public.order_supplier_groups where id = p_suborder_id;
  if not found then
    raise exception using errcode = '22023', message = 'Sous-commande introuvable';
  end if;

  update public.order_supplier_groups set status = p_status, updated_at = now() where id = p_suborder_id returning * into updated;

  perform public.log_audit_event('SUBORDER_STATUS_CHANGED', 'order_supplier_group', p_suborder_id,
    'Statut sous-commande fournisseur modifié', to_jsonb(previous_status), to_jsonb(p_status));

  /* Fait avancer automatiquement le statut visible du client vers DELIVERED uniquement quand
     TOUTES les sous-commandes de la commande sont livrées. Jamais l'inverse, jamais pour une annulation. */
  if p_status = 'DELIVERED' and not exists (
    select 1 from public.order_supplier_groups where order_id = updated.order_id and status <> 'DELIVERED'
  ) then
    update public.orders set status = 'DELIVERED', updated_at = now() where id = updated.order_id and status <> 'DELIVERED';
  end if;

  return updated;
end;
$$;
revoke all on function public.update_suborder_status(uuid, text) from public;
grant execute on function public.update_suborder_status(uuid, text) to authenticated;
