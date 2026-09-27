/*
  Étape 51 du prompt d'amélioration — Logs (§49), avec la demande
  explicite de Demba d'ajouter une suppression, alors même que le
  cahier de base disait de ne rien supprimer ici sans réflexion.

  Le RLS de suppression existe déjà (logs_delete_admin, migration 006,
  exige settings.manage) et n'a jamais été neutralisé par une révocation
  de privilège comme orders/payments/etc. (étape 27) — event_logs n'était
  pas dans cette liste, donc DELETE fonctionne réellement au niveau base.
  Mais comme pour toute suppression de ce projet, on passe par une RPC
  contrôlée plutôt qu'un DELETE REST direct, pour garder un contrôle et
  une trace cohérents.

  Deux actions, pas une corbeille : un log n'est pas une donnée
  "métier" récupérable comme un client ou une commande — soit il reste,
  soit il est effacé. Mais on ne supprime jamais aveuglément (§49) :
  - Suppression individuelle, au cas par cas.
  - Purge par ancienneté (rétention), l'usage réel pour garder un journal
    gérable sans effacer l'historique récent.
  Dans les deux cas, l'action elle-même est journalisée avant d'effacer
  quoi que ce soit — la traçabilité de "qui a purgé quoi" survit toujours
  à la purge elle-même (§49 : ne pas casser la traçabilité).
*/

create or replace function public.delete_audit_log_entry(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.event_logs;
begin
  if not public.has_permission('settings.manage') then
    raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas supprimer d''entrées du journal.';
  end if;

  select * into existing from public.event_logs where id = p_id;
  if not found then
    raise exception using errcode = '22023', message = 'Entrée introuvable.';
  end if;

  insert into public.event_logs (event_type, entity_type, entity_id, description)
  values ('AUDIT_LOG_ENTRY_DELETED', 'event_log', p_id, 'Entrée supprimée : ' || existing.event_type || ' (' || existing.created_at || ')');

  delete from public.event_logs where id = p_id;
end;
$$;
revoke all on function public.delete_audit_log_entry(uuid) from public;
grant execute on function public.delete_audit_log_entry(uuid) to authenticated;

create or replace function public.purge_audit_logs_before(p_before timestamptz)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  removed_count integer;
begin
  if not public.has_permission('settings.manage') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;
  if p_before is null or p_before > now() - interval '1 day' then
    raise exception using errcode = '22023', message = 'Choisissez une date d''au moins 24h dans le passé.';
  end if;

  select count(*) into removed_count from public.event_logs where created_at < p_before;

  insert into public.event_logs (event_type, entity_type, entity_id, description)
  values ('AUDIT_LOG_PURGED', 'event_log', null, removed_count || ' entrée(s) antérieure(s) au ' || p_before::date || ' supprimées');

  delete from public.event_logs where created_at < p_before;

  return removed_count;
end;
$$;
revoke all on function public.purge_audit_logs_before(timestamptz) from public;
grant execute on function public.purge_audit_logs_before(timestamptz) to authenticated;
