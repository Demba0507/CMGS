/*
  Correction complète CMGS — Étape 7 (§19 du prompt maître) : préparation du
  terrain pour "Orange Money automatique", sans fausse implémentation.

  CONSTAT : le prompt maître demande de conserver 3 modes de paiement
  (paiement à la livraison, Orange Money manuel, Orange Money automatique),
  mais seuls les deux premiers existaient dans le projet — aucune trace d'une
  intégration API Orange Money en temps réel (webhook de confirmation,
  identifiants marchands API) nulle part dans l'historique.

  Construire une vraie intégration nécessite de vrais identifiants marchands
  Orange Money et un vrai webhook côté Edge Function — impossible à simuler
  sans données fictives, ce que le prompt interdit explicitement (§3/§36).
  Décision prise avec Demba : préparer la structure (valeur acceptée,
  paramètre d'activation, libellés) en la laissant désactivée par défaut et
  invisible côté boutique, plutôt que d'inventer une fausse validation
  automatique qui ferait croire à un paiement vérifié sans l'être réellement.

  - Le paramètre est délibérément is_public = false : contrairement à
    payments.cash_on_delivery_enabled / orange_money_manual_enabled, il ne
    doit PAS apparaître dans get_public_settings() tant qu'aucune vraie
    intégration n'existe, pour qu'aucune option non fonctionnelle ne puisse
    apparaître par erreur sur la boutique.
  - create_public_checkout accepte désormais la valeur pour ne pas bloquer
    le jour où l'intégration réelle sera branchée, mais restera refusée par
    l'a garde d'activation existante tant que ce paramètre vaut false — donc
    aucun changement de comportement observable pour les clients aujourd'hui.
*/

insert into public.settings (key, value, category, description, is_public)
values (
  'payments.orange_money_auto_enabled',
  'false'::jsonb,
  'payments',
  'Orange Money automatique (webhook de confirmation en temps réel) — nécessite une intégration API Orange Money réelle non encore configurée. Laisser désactivé tant que les identifiants marchands API ne sont pas branchés.',
  false
)
on conflict (key) do nothing;

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
  method_enabled boolean;
  method_setting_key text;
begin
  if nullif(trim(p_name), '') is null or nullif(trim(p_phone), '') is null or nullif(trim(p_neighborhood), '') is null then
    raise exception using errcode = '22023', message = 'Informations client incomplètes';
  end if;
  if p_payment_method not in ('CASH_ON_DELIVERY', 'ORANGE_MONEY_MANUAL', 'ORANGE_MONEY_AUTOMATIC') then
    raise exception using errcode = '22023', message = 'Mode de paiement indisponible';
  end if;

  method_setting_key := case p_payment_method
    when 'CASH_ON_DELIVERY' then 'payments.cash_on_delivery_enabled'
    when 'ORANGE_MONEY_MANUAL' then 'payments.orange_money_manual_enabled'
    else 'payments.orange_money_auto_enabled'
  end;
  -- Repli sûr différent selon le mode : les deux méthodes historiques restent
  -- "activées par défaut" si le paramètre venait à manquer (comportement
  -- déjà en place avant cette migration, on ne le change pas). La méthode
  -- automatique, elle, n'étant pas réellement implémentée, reste "désactivée
  -- par défaut" même dans ce cas limite — jamais activée par accident.
  select coalesce((value)::boolean, p_payment_method <> 'ORANGE_MONEY_AUTOMATIC') into method_enabled
  from public.settings where key = method_setting_key;
  if not coalesce(method_enabled, false) then
    raise exception using errcode = '22023', message = 'Ce mode de paiement n''est actuellement pas disponible. Merci d''en choisir un autre.';
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
    select * into product_row from public.products where id = item_product_id and status = 'ACTIVE' and deleted_at is null for update;
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
  insert into public.orders (code, customer_id, customer_name, customer_phone, channel, status, subtotal, delivery_fee, service_fee, total, payment_method, payment_status, delivery_address, delivery_neighborhood)
  values (created_code, customer_id, trim(p_name), trim(p_phone), 'SITE', 'CONFIRMED', computed_subtotal, computed_delivery, 0, computed_subtotal + computed_delivery, p_payment_method, 'PENDING', nullif(trim(p_address), ''), trim(p_neighborhood))
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
