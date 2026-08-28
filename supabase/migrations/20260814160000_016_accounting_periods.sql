/* Phase 8 — Comptabilité par périodes (cahier des charges §16, §54).
   Une réinitialisation ne doit JAMAIS supprimer l'historique : elle clôture la période active et
   en ouvre une nouvelle qui repart de zéro. Toutes les périodes passées restent consultables.
   On distingue strictement économie fournisseur et marge CMGS (§14), en capturant le prix initial
   fournisseur au moment de la commande (order_items.supplier_initial_price), car ce prix peut
   changer ensuite sur la fiche produit sans fausser rétroactivement la comptabilité déjà close.
   Additive uniquement. */

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null
);
create unique index if not exists idx_accounting_periods_one_open on public.accounting_periods(status) where status = 'OPEN';

alter table public.accounting_periods enable row level security;
create policy "accounting_periods_select_authorized" on public.accounting_periods for select to authenticated
  using (public.has_permission('statistics.view') or public.has_permission('accounting.view'));
revoke all on public.accounting_periods from anon, authenticated;
grant select on public.accounting_periods to authenticated;

insert into public.accounting_periods (label, status)
select to_char(now(), 'YYYY-MM'), 'OPEN'
where not exists (select 1 from public.accounting_periods);

alter table public.orders add column if not exists accounting_period_id uuid references public.accounting_periods(id) on delete set null;
alter table public.order_items add column if not exists supplier_initial_price bigint not null default 0;
create index if not exists idx_orders_accounting_period on public.orders(accounting_period_id);

-- ============ CHECKOUT : RATTACHEMENT À LA PÉRIODE + SNAPSHOT ÉCONOMIE FOURNISSEUR ============
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
  current_period_id uuid;
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

  select id into current_period_id from public.accounting_periods where status = 'OPEN' limit 1;

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
  insert into public.orders (code, customer_id, channel, status, subtotal, delivery_fee, service_fee, total, payment_method, payment_status, delivery_address, delivery_neighborhood, accounting_period_id)
  values (created_code, customer_id, 'SITE', 'CONFIRMED', computed_subtotal, computed_delivery, 0, computed_subtotal + computed_delivery, p_payment_method, 'PENDING', nullif(trim(p_address), ''), trim(p_neighborhood), current_period_id)
  returning id into created_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    item_product_id := (item ->> 'product_id')::uuid;
    item_quantity := (item ->> 'quantity')::integer;
    select * into product_row from public.products where id = item_product_id and status = 'ACTIVE' for update;
    insert into public.order_items (order_id, product_id, product_name, product_code, quantity, unit_price, supplier_id, supplier_price, supplier_initial_price)
    values (created_order_id, product_row.id, product_row.name, product_row.code, item_quantity, product_row.sale_price, product_row.supplier_id, product_row.supplier_price, product_row.initial_supplier_price);
    update public.products set stock_verified = stock_verified - item_quantity, updated_at = now() where id = product_row.id;
    insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
    values (product_row.id, 'RESERVATION', item_quantity, product_row.stock_verified, product_row.stock_verified - item_quantity, 'Réservation checkout ' || created_code);
  end loop;

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

-- ============ RPC : BILAN FINANCIER D'UNE PÉRIODE ============
create or replace function public.get_period_financials(p_period_id uuid default null)
returns table (
  period_id uuid, period_label text, period_status text,
  sales_amount bigint, purchase_amount bigint, supplier_savings bigint, gross_margin bigint,
  delivery_fees bigint, supplier_commission bigint, cmgs_earnings bigint,
  orders_count bigint, cancelled_count bigint
)
language plpgsql security definer set search_path = public
as $$
declare
  target_period uuid;
  commission_bp bigint;
begin
  if not (public.has_permission('statistics.view') or public.has_permission('accounting.view')) then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  target_period := p_period_id;
  if target_period is null then
    select id into target_period from public.accounting_periods where status = 'OPEN' limit 1;
  end if;

  select coalesce((value)::text, '1')::bigint into commission_bp from public.settings where key = 'commerce.commission_rate_bp';
  commission_bp := coalesce(commission_bp, 1);

  return query
  select
    ap.id, ap.label, ap.status,
    coalesce(sum(oi.unit_price * oi.quantity) filter (where o.status <> 'CANCELLED'), 0)::bigint,
    coalesce(sum(oi.supplier_price * oi.quantity) filter (where o.status <> 'CANCELLED'), 0)::bigint,
    coalesce(sum(greatest(oi.supplier_initial_price - oi.supplier_price, 0) * oi.quantity) filter (where o.status <> 'CANCELLED'), 0)::bigint,
    coalesce(sum((oi.unit_price - oi.supplier_price) * oi.quantity) filter (where o.status <> 'CANCELLED'), 0)::bigint,
    coalesce((select sum(o2.delivery_fee) from public.orders o2 where o2.accounting_period_id = ap.id and o2.status <> 'CANCELLED'), 0)::bigint,
    floor(coalesce(sum(oi.supplier_price * oi.quantity) filter (where o.status <> 'CANCELLED'), 0) * commission_bp / 10000.0)::bigint,
    (coalesce(sum((oi.unit_price - oi.supplier_price) * oi.quantity) filter (where o.status <> 'CANCELLED'), 0)
      + floor(coalesce(sum(oi.supplier_price * oi.quantity) filter (where o.status <> 'CANCELLED'), 0) * commission_bp / 10000.0)
      + coalesce((select sum(o3.delivery_fee) from public.orders o3 where o3.accounting_period_id = ap.id and o3.status <> 'CANCELLED'), 0))::bigint,
    (select count(*) from public.orders o4 where o4.accounting_period_id = ap.id and o4.status <> 'CANCELLED')::bigint,
    (select count(*) from public.orders o5 where o5.accounting_period_id = ap.id and o5.status = 'CANCELLED')::bigint
  from public.accounting_periods ap
  left join public.orders o on o.accounting_period_id = ap.id
  left join public.order_items oi on oi.order_id = o.id
  where ap.id = target_period
  group by ap.id, ap.label, ap.status;
end;
$$;
revoke all on function public.get_period_financials(uuid) from public;
grant execute on function public.get_period_financials(uuid) to authenticated;

-- ============ RPC : CLÔTURER LA PÉRIODE ET EN OUVRIR UNE NOUVELLE ============
create or replace function public.close_accounting_period(p_next_label text default null)
returns public.accounting_periods
language plpgsql security definer set search_path = public
as $$
declare
  current_period public.accounting_periods;
  new_period public.accounting_periods;
  resolved_label text;
begin
  if not public.has_permission('statistics.reset') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  select * into current_period from public.accounting_periods where status = 'OPEN' limit 1;
  if not found then
    raise exception using errcode = '22023', message = 'Aucune période active à clôturer';
  end if;

  update public.accounting_periods set status = 'CLOSED', closed_at = now(), closed_by = auth.uid() where id = current_period.id;

  resolved_label := coalesce(nullif(trim(p_next_label), ''), to_char(now(), 'YYYY-MM-DD"T"HH24:MI'));
  insert into public.accounting_periods (label, status) values (resolved_label, 'OPEN') returning * into new_period;

  perform public.log_audit_event('ACCOUNTING_PERIOD_CLOSED', 'accounting_period', current_period.id,
    'Période comptable ' || current_period.label || ' clôturée, nouvelle période ' || new_period.label || ' ouverte',
    to_jsonb(current_period.label), to_jsonb(new_period.label));

  return new_period;
end;
$$;
revoke all on function public.close_accounting_period(text) from public;
grant execute on function public.close_accounting_period(text) to authenticated;
