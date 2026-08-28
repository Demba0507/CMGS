/*
  Étape 5 du cahier des charges de corrections CMGS — Corbeille et suppression
  sécurisée.

  Le principe existait déjà pour les conversations (deleted_at + restore,
  cf. migration 020) : cette migration l'étend aux Clients, Fournisseurs et
  Livreurs, qui sont des données de référence importantes (référencées par
  les commandes, produits et livraisons) où une suppression accidentelle est
  coûteuse à corriger.

  Pour chacune de ces trois tables :
  1) Ajout de deleted_at / deleted_by (déjà le motif de la table conversations).
  2) La RPC de suppression (déjà créée à l'étape 3 pour les clients) devient un
     soft-delete au lieu d'un DELETE physique, et exige désormais une
     sauvegarde récente (< 1h), exactement comme delete_conversation.
  3) Nouvelle RPC restore_*() : sort l'élément de la corbeille.
  4) Nouvelle RPC purge_*() : suppression DÉFINITIVE, réservée aux éléments
     déjà en corbeille, avec la même exigence de sauvegarde récente. Le
     frontend demandera en plus une reconfirmation par mot de passe pour ce
     geste irréversible (cf. ConfirmPasswordModal déjà utilisé ailleurs).

  On comble par la même occasion une lacune sur les conversations : une
  purge définitive n'existait pas du tout (uniquement corbeille + restauration),
  ce qui ne permettait pas de « supprimer définitivement » comme demandé au §5.

  Additive uniquement.
*/

-- ============ NOUVELLES PERMISSIONS DÉDIÉES ============
insert into public.permissions (code, name, description) values
  ('suppliers.delete', 'Supprimer les fournisseurs', 'Autorise la suppression (et la purge définitive) d''un fournisseur'),
  ('drivers.delete', 'Supprimer les livreurs', 'Autorise la suppression (et la purge définitive) d''un livreur')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r cross join (values ('suppliers.delete'), ('drivers.delete')) as p(code)
where r.code = 'ADMIN'
on conflict do nothing;

-- ============ CLIENTS : CORBEILLE ============
alter table public.customers add column if not exists deleted_at timestamptz;
alter table public.customers add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

create or replace function public.delete_customer(p_customer_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.customers;
  recent_backup_exists boolean;
begin
  if not public.has_permission('customers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas supprimer de client.';
  end if;

  select exists(select 1 from public.backups where created_at > now() - interval '1 hour') into recent_backup_exists;
  if not recent_backup_exists then
    raise exception using errcode = '22023', message = 'Aucune sauvegarde récente (moins d''1h) : créez-en une avant de supprimer.';
  end if;

  select * into existing from public.customers where id = p_customer_id and deleted_at is null;
  if not found then
    raise exception using errcode = '22023', message = 'Client introuvable ou déjà supprimé.';
  end if;

  update public.customers set deleted_at = now(), deleted_by = auth.uid() where id = p_customer_id;

  perform public.log_audit_event('CUSTOMER_DELETED', 'customer', p_customer_id,
    'Client déplacé en corbeille : ' || existing.name, to_jsonb(existing), null);
end;
$$;
revoke all on function public.delete_customer(uuid) from public;
grant execute on function public.delete_customer(uuid) to authenticated;

create or replace function public.restore_customer(p_customer_id uuid)
returns public.customers
language plpgsql security definer set search_path = public
as $$
declare
  updated public.customers;
begin
  if not public.has_permission('customers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;
  update public.customers set deleted_at = null, deleted_by = null where id = p_customer_id returning * into updated;
  if not found then
    raise exception using errcode = '22023', message = 'Client introuvable.';
  end if;
  perform public.log_audit_event('CUSTOMER_RESTORED', 'customer', p_customer_id, 'Client restauré de la corbeille : ' || updated.name, null, null);
  return updated;
end;
$$;
revoke all on function public.restore_customer(uuid) from public;
grant execute on function public.restore_customer(uuid) to authenticated;

create or replace function public.purge_customer(p_customer_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.customers;
  recent_backup_exists boolean;
begin
  if not public.has_permission('customers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;

  select exists(select 1 from public.backups where created_at > now() - interval '1 hour') into recent_backup_exists;
  if not recent_backup_exists then
    raise exception using errcode = '22023', message = 'Aucune sauvegarde récente (moins d''1h) : créez-en une avant de purger.';
  end if;

  select * into existing from public.customers where id = p_customer_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Client introuvable en corbeille (déplacez-le en corbeille avant de le purger).';
  end if;

  delete from public.customers where id = p_customer_id;

  perform public.log_audit_event('CUSTOMER_PURGED', 'customer', p_customer_id,
    'Client supprimé définitivement : ' || existing.name, to_jsonb(existing), null);
end;
$$;
revoke all on function public.purge_customer(uuid) from public;
grant execute on function public.purge_customer(uuid) to authenticated;

-- ============ FOURNISSEURS : CORBEILLE ============
alter table public.suppliers add column if not exists deleted_at timestamptz;
alter table public.suppliers add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

drop policy if exists "suppliers_delete_admin_only" on public.suppliers;
revoke delete on public.suppliers from authenticated;

create or replace function public.delete_supplier(p_supplier_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.suppliers;
  recent_backup_exists boolean;
begin
  if not public.has_permission('suppliers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas supprimer de fournisseur.';
  end if;

  select exists(select 1 from public.backups where created_at > now() - interval '1 hour') into recent_backup_exists;
  if not recent_backup_exists then
    raise exception using errcode = '22023', message = 'Aucune sauvegarde récente (moins d''1h) : créez-en une avant de supprimer.';
  end if;

  select * into existing from public.suppliers where id = p_supplier_id and deleted_at is null;
  if not found then
    raise exception using errcode = '22023', message = 'Fournisseur introuvable ou déjà supprimé.';
  end if;

  update public.suppliers set deleted_at = now(), deleted_by = auth.uid() where id = p_supplier_id;

  perform public.log_audit_event('SUPPLIER_DELETED', 'supplier', p_supplier_id,
    'Fournisseur déplacé en corbeille : ' || existing.name, to_jsonb(existing), null);
end;
$$;
revoke all on function public.delete_supplier(uuid) from public;
grant execute on function public.delete_supplier(uuid) to authenticated;

create or replace function public.restore_supplier(p_supplier_id uuid)
returns public.suppliers
language plpgsql security definer set search_path = public
as $$
declare
  updated public.suppliers;
begin
  if not public.has_permission('suppliers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;
  update public.suppliers set deleted_at = null, deleted_by = null where id = p_supplier_id returning * into updated;
  if not found then
    raise exception using errcode = '22023', message = 'Fournisseur introuvable.';
  end if;
  perform public.log_audit_event('SUPPLIER_RESTORED', 'supplier', p_supplier_id, 'Fournisseur restauré de la corbeille : ' || updated.name, null, null);
  return updated;
end;
$$;
revoke all on function public.restore_supplier(uuid) from public;
grant execute on function public.restore_supplier(uuid) to authenticated;

create or replace function public.purge_supplier(p_supplier_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.suppliers;
  recent_backup_exists boolean;
begin
  if not public.has_permission('suppliers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;

  select exists(select 1 from public.backups where created_at > now() - interval '1 hour') into recent_backup_exists;
  if not recent_backup_exists then
    raise exception using errcode = '22023', message = 'Aucune sauvegarde récente (moins d''1h) : créez-en une avant de purger.';
  end if;

  select * into existing from public.suppliers where id = p_supplier_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Fournisseur introuvable en corbeille.';
  end if;

  delete from public.suppliers where id = p_supplier_id;

  perform public.log_audit_event('SUPPLIER_PURGED', 'supplier', p_supplier_id,
    'Fournisseur supprimé définitivement : ' || existing.name, to_jsonb(existing), null);
end;
$$;
revoke all on function public.purge_supplier(uuid) from public;
grant execute on function public.purge_supplier(uuid) to authenticated;

-- ============ LIVREURS : CORBEILLE ============
alter table public.drivers add column if not exists deleted_at timestamptz;
alter table public.drivers add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

-- Remplace la policy delete large posée en 022 par la corbeille (via RPC uniquement).
drop policy if exists "drivers_delete_authorized" on public.drivers;
revoke delete on public.drivers from authenticated;

create or replace function public.delete_driver(p_driver_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.drivers;
  recent_backup_exists boolean;
begin
  if not public.has_permission('drivers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas supprimer de livreur.';
  end if;

  select exists(select 1 from public.backups where created_at > now() - interval '1 hour') into recent_backup_exists;
  if not recent_backup_exists then
    raise exception using errcode = '22023', message = 'Aucune sauvegarde récente (moins d''1h) : créez-en une avant de supprimer.';
  end if;

  select * into existing from public.drivers where id = p_driver_id and deleted_at is null;
  if not found then
    raise exception using errcode = '22023', message = 'Livreur introuvable ou déjà supprimé.';
  end if;

  update public.drivers set deleted_at = now(), deleted_by = auth.uid() where id = p_driver_id;

  perform public.log_audit_event('DRIVER_DELETED', 'driver', p_driver_id,
    'Livreur déplacé en corbeille : ' || existing.name, to_jsonb(existing), null);
end;
$$;
revoke all on function public.delete_driver(uuid) from public;
grant execute on function public.delete_driver(uuid) to authenticated;

create or replace function public.restore_driver(p_driver_id uuid)
returns public.drivers
language plpgsql security definer set search_path = public
as $$
declare
  updated public.drivers;
begin
  if not public.has_permission('drivers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;
  update public.drivers set deleted_at = null, deleted_by = null where id = p_driver_id returning * into updated;
  if not found then
    raise exception using errcode = '22023', message = 'Livreur introuvable.';
  end if;
  perform public.log_audit_event('DRIVER_RESTORED', 'driver', p_driver_id, 'Livreur restauré de la corbeille : ' || updated.name, null, null);
  return updated;
end;
$$;
revoke all on function public.restore_driver(uuid) from public;
grant execute on function public.restore_driver(uuid) to authenticated;

create or replace function public.purge_driver(p_driver_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.drivers;
  recent_backup_exists boolean;
begin
  if not public.has_permission('drivers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;

  select exists(select 1 from public.backups where created_at > now() - interval '1 hour') into recent_backup_exists;
  if not recent_backup_exists then
    raise exception using errcode = '22023', message = 'Aucune sauvegarde récente (moins d''1h) : créez-en une avant de purger.';
  end if;

  select * into existing from public.drivers where id = p_driver_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Livreur introuvable en corbeille.';
  end if;

  delete from public.drivers where id = p_driver_id;

  perform public.log_audit_event('DRIVER_PURGED', 'driver', p_driver_id,
    'Livreur supprimé définitivement : ' || existing.name, to_jsonb(existing), null);
end;
$$;
revoke all on function public.purge_driver(uuid) from public;
grant execute on function public.purge_driver(uuid) to authenticated;

-- ============ CONVERSATIONS : COMBLE LA LACUNE DE PURGE (§5, absente en migration 020) ============
create or replace function public.purge_conversation(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.conversations;
  recent_backup_exists boolean;
begin
  if not public.has_permission('settings.manage') then
    raise exception using errcode = '42501', message = 'Permission refusée : purge réservée à l''administrateur.';
  end if;

  select exists(select 1 from public.backups where created_at > now() - interval '1 hour') into recent_backup_exists;
  if not recent_backup_exists then
    raise exception using errcode = '22023', message = 'Aucune sauvegarde récente (moins d''1h) : créez-en une avant de purger.';
  end if;

  select * into existing from public.conversations where id = p_conversation_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Conversation introuvable en corbeille.';
  end if;

  delete from public.conversations where id = p_conversation_id;

  perform public.log_audit_event('CONVERSATION_PURGED', 'conversation', p_conversation_id, 'Conversation supprimée définitivement', null, null);
end;
$$;
revoke all on function public.purge_conversation(uuid) from public;
grant execute on function public.purge_conversation(uuid) to authenticated;

/*
  ============ EFFETS DE BORD DU PASSAGE EN CORBEILLE (clients et livreurs) ============

  Un soft-delete change le sens de « ce client / ce livreur n'existe plus » :
  la ligne reste en base, donc tout code qui la retrouvait par ailleurs (auto-
  création de fiche client au checkout, auto-association par user_id, accès du
  livreur à son propre espace) doit explicitement l'ignorer si elle est en
  corbeille. Sans cela, une fiche supprimée par un administrateur pourrait être
  réutilisée silencieusement (checkout, profil client) ou un livreur retiré
  continuerait à opérer normalement dans l'espace livreur — deux régressions
  de sécurité/cohérence introduites par la corbeille elle-même.
*/

-- ---- Client connecté : ne jamais réutiliser/mettre à jour une fiche en corbeille ----
create or replace function public.update_my_customer_profile(p_name text, p_phone text, p_neighborhood text, p_address text default null)
returns public.customers
language plpgsql security definer set search_path = public
as $$
declare
  updated public.customers;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Connexion requise';
  end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_phone), '') is null or nullif(trim(p_neighborhood), '') is null then
    raise exception using errcode = '22023', message = 'Nom, téléphone et quartier sont obligatoires';
  end if;

  update public.customers
  set name = trim(p_name), phone = trim(p_phone), neighborhood = trim(p_neighborhood), address = nullif(trim(p_address), '')
  where user_id = auth.uid() and deleted_at is null
  returning * into updated;

  if not found then
    insert into public.customers (name, phone, neighborhood, address, channel, status, user_id, last_interaction)
    values (trim(p_name), trim(p_phone), trim(p_neighborhood), nullif(trim(p_address), ''), 'SITE', 'CUSTOMER', auth.uid(), now())
    returning * into updated;
  end if;

  return updated;
end;
$$;
revoke all on function public.update_my_customer_profile(text, text, text, text) from public;
grant execute on function public.update_my_customer_profile(text, text, text, text) to authenticated;

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

  /* Client connecté : d'abord son propre compte, sinon une fiche invité déjà à son nom (même téléphone,
     jamais liée à un autre compte pour éviter qu'une commande n'atterrisse dans l'historique d'un tiers).
     Une fiche en corbeille n'est jamais réutilisée : le client "supprimé" en obtient une nouvelle. */
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

-- ---- Livreur en corbeille : coupe l'accès à son propre espace, pas seulement sa visibilité admin ----
drop policy if exists "drivers_select_self" on public.drivers;
create policy "drivers_select_self" on public.drivers for select to authenticated using (user_id = auth.uid() and deleted_at is null);

drop policy if exists "deliveries_select_own_driver" on public.deliveries;
create policy "deliveries_select_own_driver" on public.deliveries for select to authenticated
  using (driver_id in (select id from public.drivers where user_id = auth.uid() and deleted_at is null));

drop policy if exists "delivery_proofs_select_own_driver" on public.delivery_proofs;
create policy "delivery_proofs_select_own_driver" on public.delivery_proofs for select to authenticated
  using (delivery_id in (select id from public.deliveries where driver_id in (select id from public.drivers where user_id = auth.uid() and deleted_at is null)));

drop policy if exists "delivery_failures_select_own_driver" on public.delivery_failures;
create policy "delivery_failures_select_own_driver" on public.delivery_failures for select to authenticated
  using (delivery_id in (select id from public.deliveries where driver_id in (select id from public.drivers where user_id = auth.uid() and deleted_at is null)));

create or replace function public.update_delivery_status(p_delivery_id uuid, p_status text)
returns public.deliveries
language plpgsql security definer set search_path = public
as $$
declare
  delivery_row public.deliveries%rowtype;
  is_own_driver boolean := false;
  previous_status text;
  updated public.deliveries;
begin
  if p_status not in ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED') then
    raise exception using errcode = '22023', message = 'Statut invalide pour cette opération';
  end if;

  select * into delivery_row from public.deliveries where id = p_delivery_id;
  if not found then
    raise exception using errcode = '22023', message = 'Livraison introuvable';
  end if;

  if auth.uid() is not null then
    select true into is_own_driver from public.drivers where id = delivery_row.driver_id and user_id = auth.uid() and deleted_at is null;
  end if;
  if not coalesce(is_own_driver, false) and not public.has_permission('deliveries.update') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  previous_status := delivery_row.status;

  update public.deliveries set
    status = p_status,
    picked_up_at = case when p_status = 'PICKED_UP' then now() else picked_up_at end,
    delivered_at = case when p_status = 'DELIVERED' then now() else delivered_at end
  where id = p_delivery_id
  returning * into updated;

  if p_status = 'DELIVERED' then
    update public.orders set status = 'DELIVERED', updated_at = now() where id = updated.order_id and status <> 'DELIVERED';
  end if;

  perform public.log_audit_event('DELIVERY_STATUS_CHANGED', 'delivery', p_delivery_id, 'Statut livraison modifié', to_jsonb(previous_status), to_jsonb(p_status));
  return updated;
end;
$$;
revoke all on function public.update_delivery_status(uuid, text) from public;
grant execute on function public.update_delivery_status(uuid, text) to authenticated;

create or replace function public.record_delivery_proof(p_delivery_id uuid, p_method text, p_data text default null)
returns public.delivery_proofs
language plpgsql security definer set search_path = public
as $$
declare
  delivery_row public.deliveries%rowtype;
  is_own_driver boolean := false;
  created public.delivery_proofs;
begin
  if p_method not in ('CONFIRMATION', 'OTP', 'SIGNATURE', 'PHOTO') then
    raise exception using errcode = '22023', message = 'Méthode de preuve invalide';
  end if;

  select * into delivery_row from public.deliveries where id = p_delivery_id;
  if not found then
    raise exception using errcode = '22023', message = 'Livraison introuvable';
  end if;

  if auth.uid() is not null then
    select true into is_own_driver from public.drivers where id = delivery_row.driver_id and user_id = auth.uid() and deleted_at is null;
  end if;
  if not coalesce(is_own_driver, false) and not public.has_permission('deliveries.update') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  insert into public.delivery_proofs (delivery_id, method, data, recorded_by)
  values (p_delivery_id, p_method, p_data, auth.uid())
  returning * into created;

  return created;
end;
$$;
revoke all on function public.record_delivery_proof(uuid, text, text) from public;
grant execute on function public.record_delivery_proof(uuid, text, text) to authenticated;

create or replace function public.report_delivery_failure(p_delivery_id uuid, p_reason text, p_comment text default null)
returns public.delivery_failures
language plpgsql security definer set search_path = public
as $$
declare
  delivery_row public.deliveries%rowtype;
  is_own_driver boolean := false;
  created public.delivery_failures;
begin
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Motif obligatoire';
  end if;

  select * into delivery_row from public.deliveries where id = p_delivery_id;
  if not found then
    raise exception using errcode = '22023', message = 'Livraison introuvable';
  end if;

  if auth.uid() is not null then
    select true into is_own_driver from public.drivers where id = delivery_row.driver_id and user_id = auth.uid() and deleted_at is null;
  end if;
  if not coalesce(is_own_driver, false) and not public.has_permission('deliveries.update') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  update public.deliveries set status = 'FAILED' where id = p_delivery_id;

  insert into public.delivery_failures (delivery_id, reason, comment, reported_by)
  values (p_delivery_id, trim(p_reason), p_comment, auth.uid())
  returning * into created;

  perform public.log_audit_event('DELIVERY_FAILED', 'delivery', p_delivery_id, 'Échec de livraison signalé : ' || trim(p_reason), null, null);
  insert into public.notifications (type, title, message, target_type, target_id)
  values ('DELIVERY_FAILED', 'Échec de livraison', trim(p_reason), 'delivery', p_delivery_id);

  return created;
end;
$$;
revoke all on function public.report_delivery_failure(uuid, text, text) from public;
grant execute on function public.report_delivery_failure(uuid, text, text) to authenticated;

create or replace function public.driver_confirm_cash_payment(p_delivery_id uuid)
returns public.payments
language plpgsql security definer set search_path = public
as $$
declare
  delivery_row public.deliveries%rowtype;
  is_own_driver boolean := false;
  updated public.payments;
begin
  select * into delivery_row from public.deliveries where id = p_delivery_id;
  if not found then
    raise exception using errcode = '22023', message = 'Livraison introuvable';
  end if;

  select true into is_own_driver from public.drivers where id = delivery_row.driver_id and user_id = auth.uid() and deleted_at is null;
  if not coalesce(is_own_driver, false) then
    raise exception using errcode = '42501', message = 'Seul le livreur assigné peut confirmer ce paiement';
  end if;

  update public.payments set status = 'VERIFIED', verified_at = now()
  where order_id = delivery_row.order_id and method = 'CASH_ON_DELIVERY' and status = 'PENDING'
  returning * into updated;

  if not found then
    raise exception using errcode = '22023', message = 'Aucun paiement à la livraison en attente pour cette commande';
  end if;

  perform public.log_audit_event('PAYMENT_CONFIRMED_BY_DRIVER', 'payment', updated.id, 'Paiement à la livraison confirmé par le livreur', null, null);
  return updated;
end;
$$;
revoke all on function public.driver_confirm_cash_payment(uuid) from public;
grant execute on function public.driver_confirm_cash_payment(uuid) to authenticated;
