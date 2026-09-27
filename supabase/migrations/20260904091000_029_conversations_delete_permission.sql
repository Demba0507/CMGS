/*
  Étape 7 du prompt d'amélioration — Correction suppression conversations (§40).

  CAUSE RÉELLE (diagnostiquée à l'étape 3 de l'audit) :
  delete_conversation / restore_conversation / purge_conversation exigent
  toutes la permission settings.manage (réservée à l'ADMIN). Mais
  ConversationsPage.tsx affiche les boutons Supprimer / Restaurer / Purger
  à TOUT employé ayant accès à la page Conversations, sans aucune
  vérification de permission côté UI (contrairement à CustomersPage,
  SuppliersPage, DriversPage qui gatent déjà correctement leur bouton
  Supprimer avec has('<entité>.delete')). Un employé non-admin voit donc
  le bouton, clique, et obtient une erreur de permission — ce qui se
  manifeste comme "la suppression échoue" (§35 : une permission doit être
  cohérente UI → RPC, pas juste côté affichage).

  CORRECTION : on aligne les conversations sur le modèle déjà utilisé par
  clients/fournisseurs/livreurs — une permission granulaire dédiée
  (conversations.delete), accordée à l'ADMIN par défaut et qu'un
  administrateur peut ensuite accorder à des employés spécifiques via
  Dashboard → Employés → Permissions, sans toucher au code (même
  mécanisme que customers.delete, migration 021). La précondition de
  sauvegarde récente est retirée de delete_conversation (même correction
  qu'à l'étape 6, pour la même raison : action réversible via la
  corbeille) et conservée sur purge_conversation (irréversible).
  Additive uniquement.
*/

insert into public.permissions (code, name, description) values
  ('conversations.delete', 'Supprimer les conversations', 'Autorise la suppression (et la purge définitive) d''une conversation')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select r.id, 'conversations.delete' from public.roles r where r.code = 'ADMIN'
on conflict do nothing;

create or replace function public.delete_conversation(p_conversation_id uuid)
returns public.conversations
language plpgsql security definer set search_path = public
as $$
declare
  updated public.conversations;
begin
  if not public.has_permission('conversations.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas supprimer de conversation.';
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
  if not public.has_permission('conversations.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
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

create or replace function public.purge_conversation(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.conversations;
  recent_backup_exists boolean;
begin
  if not public.has_permission('conversations.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : purge réservée aux utilisateurs autorisés à supprimer des conversations.';
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
