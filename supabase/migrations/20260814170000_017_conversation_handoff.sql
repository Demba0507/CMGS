/* Phase 9 — Chatbot : transfert humain (§38) et clôture de conversation.
   Additive uniquement : nouvelles colonnes sur conversations/messages, nouvelles RPC. */

alter table public.conversations add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.conversations add column if not exists human_requested_at timestamptz;
alter table public.messages add column if not exists sender_id uuid references public.profiles(id) on delete set null;

-- Documente les statuts désormais utilisés (le texte libre existant reste compatible : ACTIVE par défaut).
comment on column public.conversations.status is
  'ACTIVE (bot) | AWAITING_HUMAN (transfert demandé) | HUMAN_HANDLING (pris en charge) | CLOSED';

-- ============ RPC : LE CLIENT DEMANDE UN HUMAIN (accessible sans compte, comme le reste du chat public) ============
create or replace function public.request_human_handoff(p_conversation_id uuid)
returns public.conversations
language plpgsql security definer set search_path = public
as $$
declare
  updated public.conversations;
begin
  update public.conversations
  set status = 'AWAITING_HUMAN', human_requested_at = now(), updated_at = now()
  where id = p_conversation_id and channel in ('SITE', 'SIMULATOR')
  returning * into updated;

  if not found then
    raise exception using errcode = '22023', message = 'Conversation introuvable';
  end if;

  insert into public.messages (conversation_id, sender, content, intent)
  values (p_conversation_id, 'SYSTEM', 'Le client demande à parler à un membre de l''équipe CMGS.', 'HUMAN_HANDOFF_REQUESTED');

  insert into public.notifications (type, title, message, target_type, target_id)
  values ('HUMAN_HANDOFF_REQUESTED', 'Transfert humain demandé', 'Un client souhaite parler à un conseiller.', 'conversation', p_conversation_id);

  return updated;
end;
$$;
revoke all on function public.request_human_handoff(uuid) from public;
grant execute on function public.request_human_handoff(uuid) to anon, authenticated;

-- ============ RPC : ASSIGNER UNE CONVERSATION À UN EMPLOYÉ ============
create or replace function public.assign_conversation(p_conversation_id uuid, p_employee_id uuid default null)
returns public.conversations
language plpgsql security definer set search_path = public
as $$
declare
  resolved_employee uuid;
  updated public.conversations;
begin
  if not public.has_permission('chat.assign') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  resolved_employee := coalesce(p_employee_id, auth.uid());

  update public.conversations set assigned_to = resolved_employee, status = 'HUMAN_HANDLING', updated_at = now()
  where id = p_conversation_id
  returning * into updated;
  if not found then
    raise exception using errcode = '22023', message = 'Conversation introuvable';
  end if;

  perform public.log_audit_event('CONVERSATION_ASSIGNED', 'conversation', p_conversation_id, 'Conversation assignée', null, to_jsonb(resolved_employee));
  return updated;
end;
$$;
revoke all on function public.assign_conversation(uuid, uuid) from public;
grant execute on function public.assign_conversation(uuid, uuid) to authenticated;

-- ============ RPC : UN EMPLOYÉ RÉPOND DANS LA CONVERSATION ============
create or replace function public.send_employee_message(p_conversation_id uuid, p_content text)
returns public.messages
language plpgsql security definer set search_path = public
as $$
declare
  conversation_row public.conversations%rowtype;
  created public.messages;
begin
  if not public.has_permission('chat.respond') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception using errcode = '22023', message = 'Message vide';
  end if;

  select * into conversation_row from public.conversations where id = p_conversation_id;
  if not found then
    raise exception using errcode = '22023', message = 'Conversation introuvable';
  end if;

  insert into public.messages (conversation_id, sender, sender_id, content)
  values (p_conversation_id, 'EMPLOYEE', auth.uid(), trim(p_content))
  returning * into created;

  -- Reprise automatique : si personne n'avait encore pris la main, le premier message
  -- de l'employé l'assigne à lui-même (§38 « permettre au service client de reprendre »).
  update public.conversations set
    updated_at = now(),
    status = 'HUMAN_HANDLING',
    assigned_to = coalesce(assigned_to, auth.uid())
  where id = p_conversation_id;

  return created;
end;
$$;
revoke all on function public.send_employee_message(uuid, text) from public;
grant execute on function public.send_employee_message(uuid, text) to authenticated;

-- ============ RPC : CLÔTURER UNE CONVERSATION ============
create or replace function public.close_conversation(p_conversation_id uuid)
returns public.conversations
language plpgsql security definer set search_path = public
as $$
declare
  updated public.conversations;
begin
  if not (public.has_permission('chat.respond') or public.has_permission('chat.assign')) then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  update public.conversations set status = 'CLOSED', updated_at = now() where id = p_conversation_id returning * into updated;
  if not found then
    raise exception using errcode = '22023', message = 'Conversation introuvable';
  end if;
  return updated;
end;
$$;
revoke all on function public.close_conversation(uuid) from public;
grant execute on function public.close_conversation(uuid) to authenticated;
