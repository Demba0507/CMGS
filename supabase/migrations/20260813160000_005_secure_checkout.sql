/* Atomic public checkout. The browser submits product IDs and quantities only.
   Prices, supplier data, stock and totals are read from PostgreSQL under row locks. */

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

  select c.id into customer_id from public.customers c where c.phone = trim(p_phone) order by c.created_at desc limit 1 for update;
  if customer_id is null then
    insert into public.customers (name, phone, neighborhood, address, channel, status, last_interaction)
    values (trim(p_name), trim(p_phone), trim(p_neighborhood), nullif(trim(p_address), ''), 'SITE', 'CUSTOMER', now())
    returning id into customer_id;
  else
    update public.customers set name = trim(p_name), neighborhood = trim(p_neighborhood), address = nullif(trim(p_address), ''), status = 'CUSTOMER', last_interaction = now() where id = customer_id;
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

  insert into public.payments (order_id, method, amount, status) values (created_order_id, p_payment_method, computed_subtotal + computed_delivery, 'PENDING');
  insert into public.notifications (type, title, message, target_type, target_id) values ('NEW_ORDER', 'Nouvelle commande', 'Commande ' || created_code || ' reçue de ' || trim(p_name), 'order', created_order_id);
  insert into public.event_logs (event_type, entity_type, entity_id, description) values ('ORDER_CREATED', 'order', created_order_id, 'Commande ' || created_code || ' créée via checkout sécurisé');

  return query select created_order_id, created_code, computed_subtotal, computed_delivery, computed_subtotal + computed_delivery;
end;
$$;

revoke all on function public.create_public_checkout(text, text, text, text, jsonb, text) from public;
grant execute on function public.create_public_checkout(text, text, text, text, jsonb, text) to anon, authenticated;

