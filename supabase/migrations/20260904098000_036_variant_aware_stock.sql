/*
  Étape 17 du prompt d'amélioration — Sélection de variante côté boutique
  (§10/§12). Le modèle de données (étape 15) existe déjà ; il faut
  maintenant que le stock décrémenté/restauré soit celui de la VARIANTE
  choisie quand il y en a une, pas celui du produit générique — sinon la
  sélection de variante n'aurait aucun effet réel sur le stock, ce qui
  romprait le principe "jamais de survente" déjà en place pour les
  produits simples.

  order_items garde un instantané (variant_color/variant_size), exactement
  comme product_name/product_code déjà présents — même raisonnement qu'à
  l'étape 12 : l'historique de commande ne doit jamais dépendre d'une
  variante qui pourrait être renommée ou supprimée plus tard (§52).

  Fonctions réécrites pour devenir "variant-aware" (comportement identique
  à l'existant quand p_variant_id / variant_id est null — aucune régression
  pour les produits sans variantes) : create_public_checkout, cancel_order,
  resolve_return.
*/

alter table public.order_items add column if not exists variant_id uuid references public.product_variants(id) on delete set null;
alter table public.order_items add column if not exists variant_color text;
alter table public.order_items add column if not exists variant_size text;

create or replace function public.create_public_checkout(
  p_name text, p_phone text, p_neighborhood text, p_address text, p_items jsonb,
  p_payment_method text default 'CASH_ON_DELIVERY'
)
returns table (order_id uuid, order_code text, subtotal bigint, delivery_fee bigint, total bigint)
language plpgsql security definer set search_path = public
as $$
declare
  item jsonb;
  product_row public.products%rowtype;
  variant_row public.product_variants%rowtype;
  customer_id uuid;
  created_order_id uuid;
  created_code text;
  item_product_id uuid;
  item_variant_id uuid;
  item_quantity integer;
  available_stock integer;
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
    select c.id into customer_id from public.customers c where c.user_id = auth.uid() and c.deleted_at is null for update;
  end if;

  if customer_id is null then
    select c.id into customer_id from public.customers c
    where c.phone = trim(p_phone) and (c.user_id is null or c.user_id = auth.uid()) and c.deleted_at is null
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
    item_variant_id := nullif(item ->> 'variant_id', '')::uuid;
    item_quantity := (item ->> 'quantity')::integer;
    if item_quantity is null or item_quantity < 1 or item_quantity > 100 then
      raise exception using errcode = '22023', message = 'Quantité invalide';
    end if;
    select * into product_row from public.products where id = item_product_id and status = 'ACTIVE' for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'Produit indisponible ou stock insuffisant';
    end if;
    if item_variant_id is not null then
      select * into variant_row from public.product_variants where id = item_variant_id and product_id = item_product_id for update;
      if not found or variant_row.stock < item_quantity then
        raise exception using errcode = 'P0001', message = 'Variante indisponible ou stock insuffisant';
      end if;
    elsif product_row.stock < item_quantity then
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
    item_variant_id := nullif(item ->> 'variant_id', '')::uuid;
    item_quantity := (item ->> 'quantity')::integer;
    select * into product_row from public.products where id = item_product_id and status = 'ACTIVE' for update;

    insert into public.order_items (order_id, product_id, product_name, product_code, quantity, unit_price, supplier_id, supplier_price, variant_id, variant_color, variant_size)
    select created_order_id, product_row.id, product_row.name, product_row.code, item_quantity, product_row.sale_price, product_row.supplier_id, product_row.supplier_price,
      item_variant_id, v.color, v.size
    from (select 1) dummy
    left join public.product_variants v on v.id = item_variant_id;

    if item_variant_id is not null then
      select * into variant_row from public.product_variants where id = item_variant_id for update;
      available_stock := variant_row.stock;
      update public.product_variants set stock = stock - item_quantity, updated_at = now() where id = item_variant_id;
    else
      available_stock := product_row.stock;
      update public.products set stock = stock - item_quantity, updated_at = now() where id = product_row.id;
    end if;

    insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
    values (product_row.id, 'RESERVATION', item_quantity, available_stock, available_stock - item_quantity, 'Réservation checkout ' || created_code);
  end loop;

  insert into public.payments (order_id, method, amount, status) values (created_order_id, p_payment_method, computed_subtotal + computed_delivery, 'PENDING');
  insert into public.notifications (type, title, message, target_type, target_id) values ('NEW_ORDER', 'Nouvelle commande', 'Commande ' || created_code || ' reçue de ' || trim(p_name), 'order', created_order_id);
  insert into public.event_logs (event_type, entity_type, entity_id, description) values ('ORDER_CREATED', 'order', created_order_id, 'Commande ' || created_code || ' créée via checkout sécurisé');

  return query select created_order_id, created_code, computed_subtotal, computed_delivery, computed_subtotal + computed_delivery;
end;
$$;
revoke all on function public.create_public_checkout(text, text, text, text, jsonb, text) from public;
grant execute on function public.create_public_checkout(text, text, text, text, jsonb, text) to anon, authenticated;

create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  item public.order_items%rowtype;
  updated public.orders;
  current_stock integer;
begin
  if not public.has_permission('orders.cancel') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  select * into order_row from public.orders where id = p_order_id;
  if not found then
    raise exception using errcode = '22023', message = 'Commande introuvable';
  end if;
  if order_row.status in ('CANCELLED', 'DELIVERED') then
    raise exception using errcode = '22023', message = 'Cette commande ne peut plus être annulée (statut ' || order_row.status || ')';
  end if;

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
      values (item.product_id, 'RELEASE', item.quantity, current_stock, current_stock + item.quantity, 'Annulation commande ' || order_row.code);
    end if;
  end loop;

  update public.order_supplier_groups set status = 'CANCELLED', updated_at = now() where order_id = p_order_id and status <> 'DELIVERED';

  update public.orders set status = 'CANCELLED', cancellation_reason = p_reason, updated_at = now()
  where id = p_order_id
  returning * into updated;

  perform public.log_audit_event('ORDER_CANCELLED', 'order', p_order_id, 'Commande ' || order_row.code || ' annulée' || case when p_reason is not null then ' : ' || p_reason else '' end, to_jsonb(order_row.status), to_jsonb('CANCELLED'::text));

  insert into public.notifications (type, title, message, target_type, target_id)
  values ('ORDER_CANCELLED', 'Commande annulée', 'Commande ' || order_row.code || ' annulée' || case when p_reason is not null then ' : ' || p_reason else '' end, 'order', p_order_id);

  perform public.notify_customer(order_row.customer_id, 'ORDER_CANCELLED', 'Commande annulée', 'Votre commande ' || order_row.code || ' a été annulée.', 'order', p_order_id);

  return updated;
end;
$$;
revoke all on function public.cancel_order(uuid, text) from public;
grant execute on function public.cancel_order(uuid, text) to authenticated;

create or replace function public.resolve_return(p_return_id uuid, p_status text, p_resolution text default null)
returns public.returns
language plpgsql security definer set search_path = public
as $$
declare
  previous_status text;
  target public.returns;
  updated public.returns;
  order_row public.orders%rowtype;
  item_row public.order_items%rowtype;
  current_stock integer;
begin
  if not public.has_permission('orders.edit') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if p_status not in ('APPROVED', 'REJECTED', 'COMPLETED') then
    raise exception using errcode = '22023', message = 'Statut invalide';
  end if;

  select * into target from public.returns where id = p_return_id;
  if not found then
    raise exception using errcode = '22023', message = 'Retour introuvable';
  end if;
  previous_status := target.status;

  update public.returns
  set status = p_status, resolution = coalesce(p_resolution, resolution), resolved_by = auth.uid(), resolved_at = now()
  where id = p_return_id
  returning * into updated;

  if p_status = 'COMPLETED' and target.product_id is not null then
    select * into item_row from public.order_items where id = target.order_item_id;
    if item_row.variant_id is not null then
      select stock into current_stock from public.product_variants where id = item_row.variant_id for update;
      update public.product_variants set stock = stock + coalesce(item_row.quantity, 0), updated_at = now() where id = item_row.variant_id;
    else
      select stock into current_stock from public.products where id = target.product_id for update;
      update public.products set stock = stock + coalesce(item_row.quantity, 0), updated_at = now() where id = target.product_id;
    end if;
    insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
    values (target.product_id, 'RELEASE', coalesce(item_row.quantity, 0), current_stock, current_stock + coalesce(item_row.quantity, 0), 'Retour complété ' || target.id);
  end if;

  perform public.log_audit_event('RETURN_RESOLVED', 'return', p_return_id, 'Retour ' || p_status, to_jsonb(previous_status), to_jsonb(p_status));

  if p_status in ('COMPLETED', 'REJECTED') then
    select * into order_row from public.orders where id = target.order_id;
    perform public.notify_customer(
      order_row.customer_id, 'RETURN_RESOLVED', 'Retour traité',
      case when p_status = 'COMPLETED' then 'Votre retour a été accepté et traité.' else 'Votre demande de retour a été refusée.' end,
      'return', p_return_id
    );
  end if;

  return updated;
end;
$$;
revoke all on function public.resolve_return(uuid, text, text) from public;
grant execute on function public.resolve_return(uuid, text, text) to authenticated;
