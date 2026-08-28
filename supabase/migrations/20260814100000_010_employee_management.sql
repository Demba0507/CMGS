/* Phase 2 — Gestion des employés par l'administrateur.
   La création d'un compte Supabase Auth ne peut pas se faire depuis le frontend avec la clé anon
   (il faudrait une clé service_role, jamais exposée côté client — cf. règle §6/§33 du cahier des charges).
   On utilise donc un mécanisme d'invitation : l'admin pré-autorise un e-mail avec un rôle, la personne
   s'inscrit elle-même via le flux normal (AuthPage), et le trigger handle_new_user lui attribue
   automatiquement le bon rôle au lieu de CUSTOMER. Additive uniquement. */

create table if not exists public.employee_invitations (
  email text primary key,
  role_code text not null references public.roles(code),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REVOKED')),
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz
);

alter table public.employee_invitations enable row level security;
create policy "invitations_select_authorized" on public.employee_invitations for select to authenticated using (public.has_permission('employees.view'));
revoke all on public.employee_invitations from anon, authenticated;
grant select on public.employee_invitations to authenticated;

-- ============ handle_new_user : reconnaît les invitations en attente ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  initial_admin_email constant text := 'dembadiakite839@gmail.com';
  invitation record;
  has_invitation boolean := false;
  resolved_account_type text;
begin
  select * into invitation from public.employee_invitations where email = lower(new.email) and status = 'PENDING';
  has_invitation := found;

  if lower(new.email) = initial_admin_email then
    resolved_account_type := 'ADMIN';
  elsif has_invitation then
    resolved_account_type := case when invitation.role_code = 'ADMIN' then 'ADMIN' when invitation.role_code = 'DRIVER' then 'DRIVER' else 'EMPLOYEE' end;
  else
    resolved_account_type := 'CUSTOMER';
  end if;

  insert into public.profiles (id, email, full_name, phone, account_type)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.raw_user_meta_data ->> 'phone', resolved_account_type)
  on conflict (id) do nothing;

  if lower(new.email) = initial_admin_email then
    insert into public.user_roles (user_id, role_id)
    select new.id, id from public.roles where code = 'ADMIN'
    on conflict do nothing;
  elsif has_invitation then
    insert into public.user_roles (user_id, role_id)
    select new.id, id from public.roles where code = invitation.role_code
    on conflict do nothing;
    update public.employee_invitations set status = 'ACCEPTED', accepted_at = now() where email = lower(new.email) and status = 'PENDING';
  end if;

  return new;
end;
$$;

-- ============ RPC : cycle de vie des invitations ============
create or replace function public.invite_employee(p_email text, p_role_code text)
returns public.employee_invitations
language plpgsql security definer set search_path = public
as $$
declare
  created public.employee_invitations;
begin
  if not public.has_permission('employees.create') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if nullif(trim(p_email), '') is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using errcode = '22023', message = 'Adresse e-mail invalide';
  end if;
  if not exists (select 1 from public.roles where code = p_role_code) then
    raise exception using errcode = '22023', message = 'Rôle inconnu';
  end if;

  insert into public.employee_invitations (email, role_code, status, invited_by, invited_at)
  values (lower(trim(p_email)), p_role_code, 'PENDING', auth.uid(), now())
  on conflict (email) do update set role_code = excluded.role_code, status = 'PENDING', invited_by = excluded.invited_by, invited_at = now(), accepted_at = null
  returning * into created;

  perform public.log_audit_event('EMPLOYEE_INVITED', 'employee_invitation', null, 'Invitation envoyée à ' || created.email || ' (' || p_role_code || ')', null, to_jsonb(created));
  return created;
end;
$$;
revoke all on function public.invite_employee(text, text) from public;
grant execute on function public.invite_employee(text, text) to authenticated;

create or replace function public.revoke_employee_invitation(p_email text)
returns public.employee_invitations
language plpgsql security definer set search_path = public
as $$
declare
  updated public.employee_invitations;
begin
  if not public.has_permission('employees.create') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  update public.employee_invitations set status = 'REVOKED' where email = lower(trim(p_email)) and status = 'PENDING'
  returning * into updated;
  if not found then
    raise exception using errcode = '22023', message = 'Aucune invitation en attente pour cet e-mail';
  end if;
  perform public.log_audit_event('EMPLOYEE_INVITATION_REVOKED', 'employee_invitation', null, 'Invitation révoquée pour ' || updated.email, null, null);
  return updated;
end;
$$;
revoke all on function public.revoke_employee_invitation(text) from public;
grant execute on function public.revoke_employee_invitation(text) to authenticated;

-- ============ RPC : rôle, statut, permissions d'un employé existant ============
create or replace function public.set_employee_role(p_user_id uuid, p_role_code text)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  previous_role text;
  new_account_type text;
  updated public.profiles;
begin
  if not public.has_permission('employees.edit') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception using errcode = '22023', message = 'Employé introuvable';
  end if;
  if not exists (select 1 from public.roles where code = p_role_code) then
    raise exception using errcode = '22023', message = 'Rôle inconnu';
  end if;

  select r.code into previous_role from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_user_id limit 1;

  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role_id, assigned_by)
  select p_user_id, id, auth.uid() from public.roles where code = p_role_code;

  new_account_type := case when p_role_code = 'ADMIN' then 'ADMIN' when p_role_code = 'DRIVER' then 'DRIVER' else 'EMPLOYEE' end;
  update public.profiles set account_type = new_account_type, updated_at = now() where id = p_user_id returning * into updated;

  perform public.log_audit_event('EMPLOYEE_ROLE_CHANGED', 'profile', p_user_id, 'Rôle modifié pour ' || updated.email, to_jsonb(previous_role), to_jsonb(p_role_code));
  return updated;
end;
$$;
revoke all on function public.set_employee_role(uuid, text) from public;
grant execute on function public.set_employee_role(uuid, text) to authenticated;

create or replace function public.set_employee_active(p_user_id uuid, p_is_active boolean)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  previous boolean;
  updated public.profiles;
begin
  if not public.has_permission('employees.disable') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if p_user_id = auth.uid() then
    raise exception using errcode = '22023', message = 'Vous ne pouvez pas désactiver votre propre compte';
  end if;

  select is_active into previous from public.profiles where id = p_user_id;
  if not found then
    raise exception using errcode = '22023', message = 'Employé introuvable';
  end if;

  update public.profiles set is_active = p_is_active, updated_at = now() where id = p_user_id returning * into updated;

  perform public.log_audit_event(
    case when p_is_active then 'EMPLOYEE_ENABLED' else 'EMPLOYEE_DISABLED' end,
    'profile', p_user_id, (case when p_is_active then 'Compte réactivé : ' else 'Compte désactivé : ' end) || updated.email,
    to_jsonb(previous), to_jsonb(p_is_active)
  );
  return updated;
end;
$$;
revoke all on function public.set_employee_active(uuid, boolean) from public;
grant execute on function public.set_employee_active(uuid, boolean) to authenticated;

create or replace function public.set_employee_permission_override(p_user_id uuid, p_permission_code text, p_granted boolean)
returns public.user_permission_overrides
language plpgsql security definer set search_path = public
as $$
declare
  updated public.user_permission_overrides;
begin
  if not public.has_permission('employees.edit') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if not exists (select 1 from public.permissions where code = p_permission_code) then
    raise exception using errcode = '22023', message = 'Permission inconnue';
  end if;

  insert into public.user_permission_overrides (user_id, permission_code, granted, assigned_by, assigned_at)
  values (p_user_id, p_permission_code, p_granted, auth.uid(), now())
  on conflict (user_id, permission_code) do update set granted = excluded.granted, assigned_by = excluded.assigned_by, assigned_at = now()
  returning * into updated;

  perform public.log_audit_event('EMPLOYEE_PERMISSION_OVERRIDE_SET', 'profile', p_user_id,
    'Permission ' || p_permission_code || (case when p_granted then ' accordée individuellement' else ' retirée individuellement' end), null, to_jsonb(p_granted));
  return updated;
end;
$$;
revoke all on function public.set_employee_permission_override(uuid, text, boolean) from public;
grant execute on function public.set_employee_permission_override(uuid, text, boolean) to authenticated;

create or replace function public.remove_employee_permission_override(p_user_id uuid, p_permission_code text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_permission('employees.edit') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  delete from public.user_permission_overrides where user_id = p_user_id and permission_code = p_permission_code;
  perform public.log_audit_event('EMPLOYEE_PERMISSION_OVERRIDE_REMOVED', 'profile', p_user_id, 'Retour à la permission par défaut du rôle pour ' || p_permission_code, null, null);
end;
$$;
revoke all on function public.remove_employee_permission_override(uuid, text) from public;
grant execute on function public.remove_employee_permission_override(uuid, text) to authenticated;
