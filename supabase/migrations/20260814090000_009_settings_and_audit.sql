/* Phase 1 — Fondations transverses.
   1) Table `settings` persistée (remplace le SettingsPage mocké en useState).
   2) `event_logs` enrichi avec employee_id / old_value / new_value pour un audit trail exploitable.
   3) RPC sécurisées : get_public_settings() (lecture publique whitelistée),
      update_setting() (écriture admin-only + journalisation automatique),
      log_audit_event() (helper réutilisable par les futures phases).
   Additive uniquement : aucune table/colonne existante n'est modifiée ou supprimée. */

-- ============ SETTINGS ============
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  category text not null,
  description text,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create index if not exists idx_settings_category on public.settings(category);

alter table public.settings enable row level security;

create policy "settings_select_authorized" on public.settings for select to authenticated using (public.has_permission('settings.manage'));

/* Écriture strictement via update_setting() (RPC ci-dessous) : aucun grant direct insert/update/delete. */
revoke all on public.settings from anon, authenticated;
grant select on public.settings to authenticated;

/* Valeurs par défaut, alignées sur le comportement actuellement codé en dur dans l'application
   (aucune donnée fictive : uniquement les valeurs déjà en vigueur ou explicitement vides). */
insert into public.settings (key, value, category, description, is_public) values
  ('commerce.delivery_fee_default', '1000', 'commerce', 'Frais de livraison par défaut (FCFA)', true),
  ('commerce.commission_rate_bp', '1', 'commerce', 'Commission fournisseur CMGS, en points de base (1 = 0,01%)', false),
  ('payments.cash_on_delivery_enabled', 'true', 'payments', 'Paiement à la livraison activé', true),
  ('payments.orange_money_manual_enabled', 'true', 'payments', 'Orange Money manuel activé', true),
  ('payments.orange_money_auto_enabled', 'false', 'payments', 'Orange Money automatique — API réelle non intégrée, ne jamais activer côté client', false),
  ('chatbot.enabled', 'true', 'chatbot', 'Chatbot activé sur les canaux', true),
  ('chatbot.deterministic_fallback', 'true', 'chatbot', 'Réponses de secours déterministes si le moteur IA est indisponible', false),
  ('customers.account_required', 'false', 'customers', 'Compte client obligatoire pour commander', true),
  ('service_client.phone_numbers', '[]', 'service_client', 'Numéros affichés par le chatbot quand il ne sait pas répondre (à renseigner par l''administrateur)', true)
on conflict (key) do nothing;

-- ============ EVENT_LOGS : ENRICHISSEMENT AUDIT ============
alter table public.event_logs add column if not exists employee_id uuid references public.profiles(id) on delete set null;
alter table public.event_logs add column if not exists old_value jsonb;
alter table public.event_logs add column if not exists new_value jsonb;
create index if not exists idx_logs_employee on public.event_logs(employee_id);

-- ============ RPC : LECTURE PUBLIQUE DES PARAMÈTRES SÛRS ============
/* Expose uniquement les clés marquées is_public = true. Défense en profondeur :
   orange_money_auto_enabled est explicitement exclu, quelle que soit sa valeur en base,
   car son activation côté client est interdite tant que l'API réelle n'est pas intégrée. */
create or replace function public.get_public_settings()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from public.settings
  where is_public = true
    and key <> 'payments.orange_money_auto_enabled';
$$;

revoke all on function public.get_public_settings() from public;
grant execute on function public.get_public_settings() to anon, authenticated;

-- ============ RPC : JOURNALISATION RÉUTILISABLE ============
create or replace function public.log_audit_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_description text,
  p_old_value jsonb default null,
  p_new_value jsonb default null
)
returns public.event_logs
language plpgsql security definer set search_path = public
as $$
declare
  created_log public.event_logs;
begin
  insert into public.event_logs (event_type, entity_type, entity_id, description, employee_id, old_value, new_value)
  values (p_event_type, p_entity_type, p_entity_id, p_description, auth.uid(), p_old_value, p_new_value)
  returning * into created_log;
  return created_log;
end;
$$;

revoke all on function public.log_audit_event(text, text, uuid, text, jsonb, jsonb) from public;
grant execute on function public.log_audit_event(text, text, uuid, text, jsonb, jsonb) to authenticated;

-- ============ RPC : ÉCRITURE ADMIN DES PARAMÈTRES ============
create or replace function public.update_setting(p_key text, p_value jsonb)
returns public.settings
language plpgsql security definer set search_path = public
as $$
declare
  previous public.settings;
  updated public.settings;
begin
  if not public.has_permission('settings.manage') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  select * into previous from public.settings where key = p_key;
  if not found then
    raise exception using errcode = '22023', message = 'Paramètre inconnu';
  end if;

  /* Règle métier absolue (cahier des charges §24) : ne jamais activer Orange Money automatique
     tant que l'intégration réelle n'existe pas, même via un appel direct à cette fonction. */
  if p_key = 'payments.orange_money_auto_enabled' and p_value = 'true'::jsonb then
    raise exception using errcode = '22023', message = 'Orange Money automatique ne peut pas être activé : API non intégrée';
  end if;

  update public.settings set value = p_value, updated_at = now(), updated_by = auth.uid()
  where key = p_key
  returning * into updated;

  perform public.log_audit_event('SETTING_UPDATED', 'setting', null,
    'Paramètre ' || p_key || ' modifié', to_jsonb(previous.value), to_jsonb(updated.value));

  return updated;
end;
$$;

revoke all on function public.update_setting(text, jsonb) from public;
grant execute on function public.update_setting(text, jsonb) to authenticated;
