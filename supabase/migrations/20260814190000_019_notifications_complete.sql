/* Phase 11 — Notifications complètes (cahier des charges §47-48).
   1) Annulation de commande : aucune RPC dédiée n'existait — OrdersPage faisait un UPDATE direct qui
      ne restituait JAMAIS le stock (violation de §21) et ne notifiait personne. Corrigé avec cancel_order().
   2) Déclencheur générique de stock faible/rupture (remplace les insertions ad-hoc et évite les doublons
      identifiés lors des tests : notifie uniquement au moment où le seuil est franchi, pas à chaque appel).
   3. Paiement Orange Money manuel à vérifier : notification dédiée.
   4) Table `customer_notifications` : architecture extensible (SITE actif, SMS/WhatsApp/e-mail prévus
      mais non envoyés tant qu'aucun fournisseur n'est branché), alimentée automatiquement aux étapes clés
      du parcours client (confirmation, paiement validé, livraison, annulation, retour résolu).
   Additive uniquement. */

-- ============ ANNULATION DE COMMANDE (RPC MANQUANTE) : DÉCOUVERTE PENDANT LES TESTS ============
alter table public.orders add column if not exists cancellation_reason text;

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

  -- Restitution du stock pour chaque ligne (§21 : « Si la commande est annulée, le stock doit être rétabli »).
  for item in select * from public.order_items where order_id = p_order_id loop
    if item.product_id is not null then
      update public.products set stock_verified = stock_verified + item.quantity, updated_at = now() where id = item.product_id;
      insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
      select item.product_id, 'RELEASE', item.quantity, p.stock_verified - item.quantity, p.stock_verified, 'Annulation commande ' || order_row.code
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

-- ============ NOTIFICATIONS CLIENT (ARCHITECTURE EXTENSIBLE) ============
create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  channel text not null default 'SITE' check (channel in ('SITE', 'SMS', 'WHATSAPP', 'EMAIL')),
  target_type text,
  target_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_customer_notifications_customer on public.customer_notifications(customer_id, created_at);

alter table public.customer_notifications enable row level security;
create policy "customer_notifications_select_own" on public.customer_notifications for select to authenticated
  using (customer_id in (select id from public.customers where user_id = auth.uid()));
create policy "customer_notifications_update_own" on public.customer_notifications for update to authenticated
  using (customer_id in (select id from public.customers where user_id = auth.uid()))
  with check (customer_id in (select id from public.customers where user_id = auth.uid()));
revoke all on public.customer_notifications from anon, authenticated;
grant select, update on public.customer_notifications to authenticated;

/* Point d'entrée unique pour notifier un client, quel que soit l'événement déclencheur.
   Aujourd'hui : enregistrement SITE uniquement (visible dans « Mon compte »). L'architecture est prête
   pour SMS/WhatsApp/e-mail : il suffira de brancher un envoi réel ici sans toucher aux appelants. */
create or replace function public.notify_customer(p_customer_id uuid, p_type text, p_title text, p_message text, p_target_type text default null, p_target_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_customer_id is null then return; end if;
  insert into public.customer_notifications (customer_id, type, title, message, channel, target_type, target_id)
  values (p_customer_id, p_type, p_title, p_message, 'SITE', p_target_type, p_target_id);
end;
$$;
revoke all on function public.notify_customer(uuid, text, text, text, text, uuid) from public;

-- ============ DÉCLENCHEURS : ÉVÉNEMENTS AUTOMATIQUES DU CYCLE DE VIE COMMANDE/PAIEMENT ============
create or replace function public.orders_after_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_customer(new.customer_id, 'ORDER_CONFIRMED', 'Commande confirmée', 'Votre commande ' || new.code || ' est confirmée. Merci pour votre confiance !', 'order', new.id);
  elsif tg_op = 'UPDATE' and new.status = 'DELIVERED' and old.status <> 'DELIVERED' then
    perform public.notify_customer(new.customer_id, 'DELIVERY_SUCCESS', 'Commande livrée', 'Votre commande ' || new.code || ' a été livrée. Merci de votre confiance !', 'order', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_orders_after_change on public.orders;
create trigger trg_orders_after_change after insert or update of status on public.orders for each row execute procedure public.orders_after_change();

create or replace function public.payments_after_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  order_row public.orders%rowtype;
begin
  select * into order_row from public.orders where id = new.order_id;

  if tg_op = 'INSERT' and new.method = 'ORANGE_MONEY_MANUAL' and new.status = 'PENDING' then
    insert into public.notifications (type, title, message, target_type, target_id)
    values ('PAYMENT_TO_VERIFY', 'Paiement Orange Money à vérifier', 'Commande ' || coalesce(order_row.code, '') || ' — vérifier le dépôt via le code marchand.', 'payment', new.id);
  elsif tg_op = 'UPDATE' and new.status = 'VERIFIED' and old.status <> 'VERIFIED' then
    insert into public.notifications (type, title, message, target_type, target_id)
    values ('PAYMENT_VALIDATED', 'Paiement validé', 'Paiement de la commande ' || coalesce(order_row.code, '') || ' validé.', 'payment', new.id);
    perform public.notify_customer(order_row.customer_id, 'PAYMENT_VALIDATED', 'Paiement validé', 'Le paiement de votre commande ' || coalesce(order_row.code, '') || ' a été validé.', 'payment', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_payments_after_change on public.payments;
create trigger trg_payments_after_change after insert or update of status on public.payments for each row execute procedure public.payments_after_change();

-- ============ DÉCLENCHEUR UNIFIÉ : STOCK FAIBLE / RUPTURE (remplace les insertions ad-hoc dispersées) ============
/* Ne notifie qu'au moment où le seuil est FRANCHI (comparaison OLD vs NEW), pas à chaque mise à jour,
   pour éviter le spam de notifications identifiées lors des tests de la Phase 4. */
create or replace function public.products_stock_after_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.stock_verified = old.stock_verified then
    return new;
  end if;

  if new.stock_verified <= 0 and old.stock_verified > 0 then
    insert into public.notifications (type, title, message, target_type, target_id)
    values ('OUT_OF_STOCK', 'Produit en rupture', '« ' || new.name || ' » est maintenant en rupture de stock.', 'product', new.id);
  elsif new.stock_verified > 0 and new.stock_verified <= new.low_stock_threshold and old.stock_verified > old.low_stock_threshold then
    insert into public.notifications (type, title, message, target_type, target_id)
    values ('LOW_STOCK', 'Stock faible', '« ' || new.name || ' » : stock faible (' || new.stock_verified || ' restant(s)).', 'product', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_products_stock_after_change on public.products;
create trigger trg_products_stock_after_change after update of stock_verified on public.products for each row execute procedure public.products_stock_after_change();

-- ============ RETOUR RÉSOLU : NOTIFIER LE CLIENT ============
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
    update public.products set stock_verified = stock_verified + coalesce((select quantity from public.order_items where id = target.order_item_id), 0), updated_at = now()
    where id = target.product_id;
    insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
    select target.product_id, 'RELEASE', oi.quantity, p.stock_verified - oi.quantity, p.stock_verified, 'Retour complété ' || target.id
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
