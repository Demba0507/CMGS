/* Phase 7 — Livraisons avancées (cahier des charges §27-31).
   FAILLE CORRIGÉE AU PASSAGE : comme `returns` en Phase 3, la table `drivers` était restée ouverte
   en écriture/lecture à `anon` depuis la migration 001 (jamais refermée). N'importe qui pouvait lire
   ou modifier les numéros de téléphone des livreurs, voire en créer de faux. Verrouillée ici.
   Additive sinon : preuve de livraison, échec structuré à décision manuelle, espace livreur,
   géolocalisation client facultative. */

-- ============ CORRECTION DE FAILLE : SÉCURISATION DE drivers ============
drop policy if exists "anon_select_drivers" on public.drivers;
drop policy if exists "anon_insert_drivers" on public.drivers;
drop policy if exists "anon_update_drivers" on public.drivers;
drop policy if exists "anon_delete_drivers" on public.drivers;

alter table public.drivers add column if not exists user_id uuid references public.profiles(id) on delete set null;

create policy "drivers_select_authorized" on public.drivers for select to authenticated using (public.has_permission('deliveries.view') or public.has_permission('deliveries.assign'));
create policy "drivers_select_self" on public.drivers for select to authenticated using (user_id = auth.uid());
revoke all on public.drivers from anon, authenticated;
grant select on public.drivers to authenticated;

-- ============ LIVRAISONS : ACCÈS PROPRE DU LIVREUR À SES COURSES ============
create policy "deliveries_select_own_driver" on public.deliveries for select to authenticated
  using (driver_id in (select id from public.drivers where user_id = auth.uid()));

-- ============ PREUVE DE LIVRAISON (§30) ============
create table if not exists public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  method text not null check (method in ('CONFIRMATION', 'OTP', 'SIGNATURE', 'PHOTO')),
  data text,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_delivery_proofs_delivery on public.delivery_proofs(delivery_id);
alter table public.delivery_proofs enable row level security;
create policy "delivery_proofs_select_authorized" on public.delivery_proofs for select to authenticated using (public.has_permission('deliveries.view'));
create policy "delivery_proofs_select_own_driver" on public.delivery_proofs for select to authenticated
  using (delivery_id in (select id from public.deliveries where driver_id in (select id from public.drivers where user_id = auth.uid())));
revoke all on public.delivery_proofs from anon, authenticated;
grant select on public.delivery_proofs to authenticated;

-- ============ ÉCHEC DE LIVRAISON : ENREGISTREMENT + DÉCISION MANUELLE (§31) ============
create table if not exists public.delivery_failures (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  reason text not null,
  comment text,
  reported_by uuid references public.profiles(id) on delete set null,
  reported_at timestamptz not null default now(),
  decision text check (decision in ('RETRY', 'RETURN', 'CANCEL_ORDER')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz
);
create index if not exists idx_delivery_failures_delivery on public.delivery_failures(delivery_id);
alter table public.delivery_failures enable row level security;
create policy "delivery_failures_select_authorized" on public.delivery_failures for select to authenticated using (public.has_permission('deliveries.view'));
create policy "delivery_failures_select_own_driver" on public.delivery_failures for select to authenticated
  using (delivery_id in (select id from public.deliveries where driver_id in (select id from public.drivers where user_id = auth.uid())));
revoke all on public.delivery_failures from anon, authenticated;
grant select on public.delivery_failures to authenticated;

-- ============ GÉOLOCALISATION CLIENT FACULTATIVE (§27) ============
alter table public.customers add column if not exists latitude double precision;
alter table public.customers add column if not exists longitude double precision;

create or replace function public.update_my_customer_location(p_latitude double precision, p_longitude double precision)
returns public.customers
language plpgsql security definer set search_path = public
as $$
declare
  updated public.customers;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Connexion requise';
  end if;
  if p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    raise exception using errcode = '22023', message = 'Coordonnées invalides';
  end if;

  update public.customers set latitude = p_latitude, longitude = p_longitude
  where user_id = auth.uid()
  returning * into updated;

  if not found then
    raise exception using errcode = '22023', message = 'Profil client introuvable';
  end if;
  return updated;
end;
$$;
revoke all on function public.update_my_customer_location(double precision, double precision) from public;
grant execute on function public.update_my_customer_location(double precision, double precision) to authenticated;

-- ============ RPC : ASSIGNER UNE LIVRAISON ============
create or replace function public.assign_delivery(p_order_id uuid, p_driver_id uuid)
returns public.deliveries
language plpgsql security definer set search_path = public
as $$
declare
  created public.deliveries;
begin
  if not public.has_permission('deliveries.assign') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if not exists (select 1 from public.drivers where id = p_driver_id) then
    raise exception using errcode = '22023', message = 'Livreur introuvable';
  end if;

  insert into public.deliveries (order_id, driver_id, status, assigned_at)
  values (p_order_id, p_driver_id, 'ASSIGNED', now())
  on conflict (order_id) do update set driver_id = excluded.driver_id, status = 'ASSIGNED', assigned_at = now(), picked_up_at = null, delivered_at = null
  returning * into created;

  perform public.log_audit_event('DELIVERY_ASSIGNED', 'delivery', created.id, 'Livraison assignée', null, to_jsonb(p_driver_id));
  return created;
end;
$$;
revoke all on function public.assign_delivery(uuid, uuid) from public;
grant execute on function public.assign_delivery(uuid, uuid) to authenticated;

-- ============ RPC : CHANGER LE STATUT (employé ou livreur assigné) ============
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
    select true into is_own_driver from public.drivers where id = delivery_row.driver_id and user_id = auth.uid();
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

-- ============ RPC : ENREGISTRER UNE PREUVE DE LIVRAISON ============
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
    select true into is_own_driver from public.drivers where id = delivery_row.driver_id and user_id = auth.uid();
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

-- ============ RPC : SIGNALER UN ÉCHEC (jamais de procédure automatique unique — §31) ============
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
    select true into is_own_driver from public.drivers where id = delivery_row.driver_id and user_id = auth.uid();
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

-- ============ RPC : DÉCISION MANUELLE SUITE À UN ÉCHEC (employé uniquement) ============
create or replace function public.resolve_delivery_failure(p_failure_id uuid, p_decision text)
returns public.delivery_failures
language plpgsql security definer set search_path = public
as $$
declare
  failure_row public.delivery_failures%rowtype;
  updated public.delivery_failures;
begin
  if not public.has_permission('deliveries.update') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if p_decision not in ('RETRY', 'RETURN', 'CANCEL_ORDER') then
    raise exception using errcode = '22023', message = 'Décision invalide';
  end if;

  select * into failure_row from public.delivery_failures where id = p_failure_id;
  if not found then
    raise exception using errcode = '22023', message = 'Signalement introuvable';
  end if;

  update public.delivery_failures set decision = p_decision, decided_by = auth.uid(), decided_at = now()
  where id = p_failure_id
  returning * into updated;

  if p_decision = 'RETRY' then
    update public.deliveries set status = 'ASSIGNED', picked_up_at = null where id = failure_row.delivery_id;
  elsif p_decision = 'RETURN' then
    update public.deliveries set status = 'RETURNED' where id = failure_row.delivery_id;
  elsif p_decision = 'CANCEL_ORDER' then
    update public.orders set status = 'CANCELLED', updated_at = now()
    where id = (select order_id from public.deliveries where id = failure_row.delivery_id);
  end if;

  perform public.log_audit_event('DELIVERY_FAILURE_RESOLVED', 'delivery', failure_row.delivery_id, 'Décision suite échec : ' || p_decision, null, to_jsonb(p_decision));
  return updated;
end;
$$;
revoke all on function public.resolve_delivery_failure(uuid, text) from public;
grant execute on function public.resolve_delivery_failure(uuid, text) to authenticated;

-- ============ RPC : LE LIVREUR CONFIRME UN PAIEMENT À LA LIVRAISON ============
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

  select true into is_own_driver from public.drivers where id = delivery_row.driver_id and user_id = auth.uid();
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

-- La colonne order_id de deliveries doit être unique pour permettre l'upsert d'assign_delivery.
create unique index if not exists idx_deliveries_order_unique on public.deliveries(order_id);
