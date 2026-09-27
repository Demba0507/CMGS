/*
  Correction demandée explicitement par Demba en cours d'étape 14 — remplace
  le double concept "stock déclaré / stock vérifié" (avec circuit de
  vérification téléphonique fournisseur) par UN SEUL champ "stock",
  enregistré et modifié directement par CMGS. Le circuit de déclaration/
  vérification fournisseur (onglet "Historique stock" de SupplierPanel) est
  supprimé entièrement, comme demandé.

  Ce qui disparaît :
  - products.stock_declared (colonne supprimée)
  - product_suppliers.declared_stock / verified_stock / last_verified_at
  - la table supplier_stock_reports en entier (le journal des appels)
  - les fonctions declare_supplier_stock, verify_supplier_stock,
    recompute_product_stock (plus de raison d'être sans le circuit)

  Ce qui reste et est renommé :
  - products.stock_verified -> products.stock (une seule source de vérité,
    modifiable directement dans le formulaire produit par CMGS)
  - product_suppliers garde is_primary/initial_supplier_price/purchase_price :
    la comparaison de prix entre fournisseurs reste une fonctionnalité
    à part, non liée au stock, donc non concernée par cette demande.

  Toute fonction qui référence stock_verified par son nom doit être
  réécrite (un RENAME COLUMN ne met pas à jour le corps des fonctions
  existantes) : create_public_checkout, get_public_products, cancel_order,
  products_stock_after_change (+ son trigger), resolve_return, et
  restore_backup. Reprises ici à l'identique sauf le renommage de colonne —
  aucune autre logique changée.

  ATTENTION (à signaler à l'utilisateur) : une sauvegarde créée AVANT cette
  migration contient encore les clés JSON stock_declared/stock_verified.
  jsonb_populate_recordset ignore silencieusement les clés qui ne
  correspondent plus à une colonne actuelle : restaurer une sauvegarde
  pré-migration remettra donc stock à sa valeur par défaut (0) pour tous
  les produits. Une nouvelle sauvegarde après cette migration est
  recommandée.
*/

-- ---- 1) Suppression du circuit de déclaration/vérification fournisseur ----
drop function if exists public.verify_supplier_stock(uuid, integer, text);
drop function if exists public.declare_supplier_stock(uuid, integer, text);
drop function if exists public.recompute_product_stock(uuid);
drop table if exists public.supplier_stock_reports;
alter table public.product_suppliers drop column if exists declared_stock;
alter table public.product_suppliers drop column if exists verified_stock;
alter table public.product_suppliers drop column if exists last_verified_at;

-- ---- 2) Un seul champ stock sur products ----
drop trigger if exists trg_products_stock_after_change on public.products;
alter table public.products rename column stock_verified to stock;
alter table public.products drop column if exists stock_declared;

-- ---- 3) Réécriture des fonctions qui référençaient stock_verified/stock_declared ----

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
  where p.status = 'ACTIVE';
$$;
grant execute on function public.get_public_products() to anon, authenticated;

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
    item_quantity := (item ->> 'quantity')::integer;
    if item_quantity is null or item_quantity < 1 or item_quantity > 100 then
      raise exception using errcode = '22023', message = 'Quantité invalide';
    end if;
    select * into product_row from public.products where id = item_product_id and status = 'ACTIVE' for update;
    if not found or product_row.stock < item_quantity then
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
    update public.products set stock = stock - item_quantity, updated_at = now() where id = product_row.id;
    insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
    values (product_row.id, 'RESERVATION', item_quantity, product_row.stock, product_row.stock - item_quantity, 'Réservation checkout ' || created_code);
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
    if item.product_id is not null then
      update public.products set stock = stock + item.quantity, updated_at = now() where id = item.product_id;
      insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
      select item.product_id, 'RELEASE', item.quantity, p.stock - item.quantity, p.stock, 'Annulation commande ' || order_row.code
      from public.products p where p.id = item.product_id;
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

create or replace function public.products_stock_after_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.stock = old.stock then
    return new;
  end if;

  if new.stock <= 0 and old.stock > 0 then
    insert into public.notifications (type, title, message, target_type, target_id)
    values ('OUT_OF_STOCK', 'Produit en rupture', '« ' || new.name || ' » est maintenant en rupture de stock.', 'product', new.id);
  elsif new.stock > 0 and new.stock <= new.low_stock_threshold and old.stock > old.low_stock_threshold then
    insert into public.notifications (type, title, message, target_type, target_id)
    values ('LOW_STOCK', 'Stock faible', '« ' || new.name || ' » : stock faible (' || new.stock || ' restant(s)).', 'product', new.id);
  end if;
  return new;
end;
$$;
create trigger trg_products_stock_after_change after update of stock on public.products for each row execute procedure public.products_stock_after_change();

create or replace function public.resolve_return(p_return_id uuid, p_status text, p_resolution text default null)
returns public.returns
language plpgsql security definer set search_path = public
as $$
declare
  previous_status text;
  target public.returns;
  updated public.returns;
  order_row public.orders%rowtype;
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
    update public.products set stock = stock + coalesce((select quantity from public.order_items where id = target.order_item_id), 0), updated_at = now()
    where id = target.product_id;
    insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
    select target.product_id, 'RELEASE', oi.quantity, p.stock - oi.quantity, p.stock, 'Retour complété ' || target.id
    from public.order_items oi, public.products p where oi.id = target.order_item_id and p.id = target.product_id;
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

create or replace function public.restore_backup(p_backup_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  target public.backups;
  restored text[] := '{}';
  skipped text[] := array['orders', 'order_items'];
begin
  if not (public.has_permission('settings.manage') or public.has_permission('maintenance.manage')) then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  select * into target from public.backups where id = p_backup_id;
  if not found then
    raise exception using errcode = '22023', message = 'Sauvegarde introuvable';
  end if;

  perform public.create_backup_snapshot('Sauvegarde automatique avant restauration de "' || target.reason || '"');

  if target.snapshot ? 'roles' then
    insert into public.roles
    select * from jsonb_populate_recordset(null::public.roles, target.snapshot->'roles')
    on conflict (id) do update set code = excluded.code, name = excluded.name, description = excluded.description;
    restored := array_append(restored, 'roles');
  end if;

  if target.snapshot ? 'settings' then
    insert into public.settings
    select * from jsonb_populate_recordset(null::public.settings, target.snapshot->'settings')
    on conflict (key) do update set value = excluded.value, category = excluded.category,
      description = excluded.description, is_public = excluded.is_public, updated_at = now(), updated_by = auth.uid();
    restored := array_append(restored, 'settings');
  end if;

  if target.snapshot ? 'categories' then
    insert into public.categories
    select * from jsonb_populate_recordset(null::public.categories, target.snapshot->'categories')
    on conflict (id) do update set name = excluded.name, slug = excluded.slug, parent_id = excluded.parent_id;
    restored := array_append(restored, 'categories');
  end if;

  if target.snapshot ? 'suppliers' then
    insert into public.suppliers
    select * from jsonb_populate_recordset(null::public.suppliers, target.snapshot->'suppliers')
    on conflict (id) do update set code = excluded.code, name = excluded.name, business_name = excluded.business_name,
      phone = excluded.phone, zone = excluded.zone, contact_info = excluded.contact_info, status = excluded.status,
      quality_rating = excluded.quality_rating, deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by;
    restored := array_append(restored, 'suppliers');
  end if;

  if target.snapshot ? 'customers' then
    insert into public.customers
    select * from jsonb_populate_recordset(null::public.customers, target.snapshot->'customers')
    on conflict (id) do update set name = excluded.name, phone = excluded.phone, neighborhood = excluded.neighborhood,
      address = excluded.address, channel = excluded.channel, status = excluded.status,
      last_interaction = excluded.last_interaction, user_id = excluded.user_id,
      deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by;
    restored := array_append(restored, 'customers');
  end if;

  -- NOTE : une sauvegarde antérieure à cette migration contient encore les clés JSON
  -- stock_declared/stock_verified ; jsonb_populate_recordset les ignore silencieusement
  -- puisqu'elles ne correspondent plus à une colonne, et stock repart donc à 0 pour ces
  -- sauvegardes-là. Sans conséquence pour toute sauvegarde créée après cette migration.
  if target.snapshot ? 'products' then
    insert into public.products
    select * from jsonb_populate_recordset(null::public.products, target.snapshot->'products')
    on conflict (id) do update set code = excluded.code, name = excluded.name, description = excluded.description,
      category_id = excluded.category_id, supplier_id = excluded.supplier_id, supplier_price = excluded.supplier_price,
      sale_price = excluded.sale_price, stock = excluded.stock,
      stock_last_checked = excluded.stock_last_checked, image_url = excluded.image_url, status = excluded.status,
      updated_at = now(), brand = excluded.brand, low_stock_threshold = coalesce(excluded.low_stock_threshold, 5),
      initial_supplier_price = coalesce(excluded.initial_supplier_price, 0), purchase_price = coalesce(excluded.purchase_price, 0);
    restored := array_append(restored, 'products');
  end if;

  if target.snapshot ? 'role_permissions' then
    insert into public.role_permissions
    select * from jsonb_populate_recordset(null::public.role_permissions, target.snapshot->'role_permissions')
    on conflict (role_id, permission_code) do nothing;
    restored := array_append(restored, 'role_permissions');
  end if;

  perform public.log_audit_event('BACKUP_RESTORED', 'backup', target.id,
    'Sauvegarde "' || target.reason || '" restaurée (fusion, sans suppression) — tables : ' || array_to_string(restored, ', '),
    null, jsonb_build_object('restored', restored, 'skipped', skipped));

  return jsonb_build_object('restored', restored, 'skipped', skipped);
end;
$$;
revoke all on function public.restore_backup(uuid) from public;
grant execute on function public.restore_backup(uuid) to authenticated;
