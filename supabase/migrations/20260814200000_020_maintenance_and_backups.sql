/* Phase 13 — Maintenance, sauvegardes, actions critiques (cahier des charges §53, §55, §59, §65).
   1) Mode maintenance : paramètre public, affiché côté client sans bloquer le dashboard/l'espace livreur.
   2) Sauvegardes manuelles : snapshot JSON des tables critiques, horodaté et attribué à l'admin qui l'a
      déclenché. Pas d'accès disque/pg_dump réel possible depuis une RPC — c'est un instantané applicatif,
      suffisant pour restaurer manuellement les données métier en cas de besoin.
   3) Suppression de conversation = action critique : la RPC exige elle-même qu'une sauvegarde récente
      existe (moins d'1 heure), pour appliquer la règle « sauvegarde automatique préalable » au niveau
      serveur et pas seulement comme une case à cocher côté interface. Suppression = corbeille (deleted_at),
      jamais un DELETE physique, avec restauration possible (§46 : « corbeille/récupération »).
   Additive uniquement. */

insert into public.settings (key, value, category, description, is_public) values
  ('system.maintenance_mode', 'false', 'system', 'Mode maintenance : affiche une page d''attente côté site client', true)
on conflict (key) do nothing;

-- ============ SAUVEGARDES MANUELLES (SNAPSHOT APPLICATIF) ============
create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  tables_included text[] not null,
  row_counts jsonb not null default '{}'::jsonb,
  snapshot jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_backups_created_at on public.backups(created_at desc);

alter table public.backups enable row level security;
create policy "backups_select_authorized" on public.backups for select to authenticated using (public.has_permission('settings.manage') or public.has_permission('accounting.manage'));
revoke all on public.backups from anon, authenticated;
grant select on public.backups to authenticated;

create or replace function public.create_backup_snapshot(p_reason text)
returns public.backups
language plpgsql security definer set search_path = public
as $$
declare
  created public.backups;
  snapshot_data jsonb;
  counts jsonb;
begin
  if not (public.has_permission('settings.manage') or public.has_permission('accounting.manage')) then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Le motif de la sauvegarde est obligatoire';
  end if;

  select jsonb_build_object(
    'products', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.products t),
    'categories', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.categories t),
    'suppliers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.suppliers t),
    'customers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.customers t),
    'orders', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.orders t),
    'order_items', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.order_items t),
    'settings', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.settings t),
    'roles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.roles t),
    'role_permissions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.role_permissions t)
  ) into snapshot_data;

  select jsonb_object_agg(key, jsonb_array_length(value)) into counts from jsonb_each(snapshot_data);

  insert into public.backups (reason, tables_included, row_counts, snapshot, created_by)
  values (trim(p_reason), array['products','categories','suppliers','customers','orders','order_items','settings','roles','role_permissions'], counts, snapshot_data, auth.uid())
  returning * into created;

  perform public.log_audit_event('BACKUP_CREATED', 'backup', created.id, 'Sauvegarde manuelle : ' || trim(p_reason), null, counts);

  return created;
end;
$$;
revoke all on function public.create_backup_snapshot(text) from public;
grant execute on function public.create_backup_snapshot(text) to authenticated;

-- ============ CONVERSATIONS : CORBEILLE (jamais de suppression physique) ============
alter table public.conversations add column if not exists archived boolean not null default false;
alter table public.conversations add column if not exists deleted_at timestamptz;

create or replace function public.archive_conversation(p_conversation_id uuid, p_archived boolean default true)
returns public.conversations
language plpgsql security definer set search_path = public
as $$
declare
  updated public.conversations;
begin
  if not (public.has_permission('chat.assign') or public.has_permission('complaints.manage')) then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  update public.conversations set archived = p_archived where id = p_conversation_id returning * into updated;
  if not found then
    raise exception using errcode = '22023', message = 'Conversation introuvable';
  end if;
  return updated;
end;
$$;
revoke all on function public.archive_conversation(uuid, boolean) from public;
grant execute on function public.archive_conversation(uuid, boolean) to authenticated;

/* Suppression = action critique (§55) : exige une sauvegarde de moins d'1 heure, sinon la RPC
   refuse explicitement et invite à en créer une — la règle « sauvegarde préalable » est donc
   appliquée par le serveur, pas seulement suggérée côté interface. Soft-delete uniquement. */
create or replace function public.delete_conversation(p_conversation_id uuid)
returns public.conversations
language plpgsql security definer set search_path = public
as $$
declare
  updated public.conversations;
  recent_backup_exists boolean;
begin
  if not public.has_permission('settings.manage') then
    raise exception using errcode = '42501', message = 'Permission refusée : suppression réservée à l''administrateur';
  end if;

  select exists(select 1 from public.backups where created_at > now() - interval '1 hour') into recent_backup_exists;
  if not recent_backup_exists then
    raise exception using errcode = '22023', message = 'Aucune sauvegarde récente (moins d''1h) : créez-en une avant de supprimer';
  end if;

  update public.conversations set deleted_at = now() where id = p_conversation_id and deleted_at is null returning * into updated;
  if not found then
    raise exception using errcode = '22023', message = 'Conversation introuvable ou déjà supprimée';
  end if;

  perform public.log_audit_event('CONVERSATION_DELETED', 'conversation', p_conversation_id, 'Conversation déplacée en corbeille', null, null);
  return updated;
end;
$$;
revoke all on function public.delete_conversation(uuid) from public;
grant execute on function public.delete_conversation(uuid) to authenticated;

create or replace function public.restore_conversation(p_conversation_id uuid)
returns public.conversations
language plpgsql security definer set search_path = public
as $$
declare
  updated public.conversations;
begin
  if not public.has_permission('settings.manage') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  update public.conversations set deleted_at = null where id = p_conversation_id returning * into updated;
  if not found then
    raise exception using errcode = '22023', message = 'Conversation introuvable';
  end if;
  perform public.log_audit_event('CONVERSATION_RESTORED', 'conversation', p_conversation_id, 'Conversation restaurée de la corbeille', null, null);
  return updated;
end;
$$;
revoke all on function public.restore_conversation(uuid) from public;
grant execute on function public.restore_conversation(uuid) to authenticated;

-- ============ RÉINITIALISATION COMPTABLE : ACTION CRITIQUE ELLE AUSSI (§55) ============
/* close_accounting_period (Phase 8) ne demandait pas encore de sauvegarde préalable — corrigé ici
   pour appliquer la même règle que la suppression de conversation. */
create or replace function public.close_accounting_period(p_next_label text default null)
returns public.accounting_periods
language plpgsql security definer set search_path = public
as $$
declare
  current_period public.accounting_periods;
  new_period public.accounting_periods;
  resolved_label text;
  recent_backup_exists boolean;
begin
  if not public.has_permission('statistics.reset') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  select exists(select 1 from public.backups where created_at > now() - interval '1 hour') into recent_backup_exists;
  if not recent_backup_exists then
    raise exception using errcode = '22023', message = 'Aucune sauvegarde récente (moins d''1h) : créez-en une avant de clôturer la période';
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
