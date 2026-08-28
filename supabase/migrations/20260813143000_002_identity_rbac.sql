/*
  CMGS Commerce — identity and authorization foundation.
  This migration is additive. It does not delete operational data.
  The initial administrator is intentionally limited to the email supplied by CMGS.
  Passwords are handled exclusively by Supabase Auth and never stored in this schema.
*/

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null unique,
  full_name text,
  phone text,
  account_type text not null default 'CUSTOMER' check (account_type in ('ADMIN', 'EMPLOYEE', 'DRIVER', 'CUSTOMER')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  code text primary key,
  name text not null,
  description text
);

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  primary key (user_id, role_id)
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_id, permission_code)
);

create table if not exists public.user_permission_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  granted boolean not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  primary key (user_id, permission_code)
);

insert into public.roles (code, name, description) values
  ('ADMIN', 'Administrateur', 'Accès complet CMGS'),
  ('PRODUCT_MANAGER', 'Gestionnaire produits et stock', 'Produits, catégories, fournisseurs et stock'),
  ('ORDER_MANAGER', 'Gestionnaire commandes', 'Commandes, clients et paiements'),
  ('CUSTOMER_SERVICE', 'Service client', 'Conversations, clients et réclamations'),
  ('DRIVER', 'Livreur', 'Livraisons assignées')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.permissions (code, name) values
  ('products.view', 'Voir les produits'), ('products.create', 'Créer les produits'), ('products.edit', 'Modifier les produits'), ('products.delete', 'Supprimer les produits'), ('products.images', 'Gérer les images produits'),
  ('stock.view', 'Voir les stocks'), ('stock.edit', 'Modifier les stocks'), ('stock.verify', 'Vérifier les stocks'),
  ('suppliers.view', 'Voir les fournisseurs'), ('suppliers.create', 'Créer les fournisseurs'), ('suppliers.edit', 'Modifier les fournisseurs'),
  ('orders.view', 'Voir les commandes'), ('orders.create', 'Créer les commandes'), ('orders.edit', 'Modifier les commandes'), ('orders.cancel', 'Annuler les commandes'),
  ('payments.view', 'Voir les paiements'), ('payments.validate', 'Valider les paiements'), ('payments.refund', 'Rembourser les paiements'),
  ('customers.view', 'Voir les clients'), ('customers.edit', 'Modifier les clients'),
  ('chat.view', 'Voir les conversations'), ('chat.respond', 'Répondre aux conversations'), ('chat.assign', 'Assigner les conversations'),
  ('complaints.view', 'Voir les réclamations'), ('complaints.manage', 'Gérer les réclamations'),
  ('deliveries.view', 'Voir les livraisons'), ('deliveries.assign', 'Assigner les livraisons'), ('deliveries.update', 'Mettre à jour les livraisons'),
  ('employees.view', 'Voir les employés'), ('employees.create', 'Créer les employés'), ('employees.edit', 'Modifier les employés'), ('employees.disable', 'Désactiver les employés'),
  ('statistics.view', 'Voir les statistiques'), ('statistics.reset', 'Créer une période comptable'),
  ('accounting.view', 'Voir la comptabilité'), ('accounting.manage', 'Gérer la comptabilité'),
  ('settings.manage', 'Gérer les paramètres'), ('audit.view', 'Voir les audits')
on conflict (code) do update set name = excluded.name;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r cross join public.permissions p where r.code = 'ADMIN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r join public.permissions p on p.code in ('products.view','products.create','products.edit','products.delete','products.images','stock.view','stock.edit','stock.verify','suppliers.view','suppliers.create','suppliers.edit') where r.code = 'PRODUCT_MANAGER'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r join public.permissions p on p.code in ('orders.view','orders.create','orders.edit','orders.cancel','payments.view','payments.validate','customers.view','customers.edit') where r.code = 'ORDER_MANAGER'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r join public.permissions p on p.code in ('customers.view','customers.edit','chat.view','chat.respond','chat.assign','complaints.view','complaints.manage') where r.code = 'CUSTOMER_SERVICE'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r join public.permissions p on p.code in ('deliveries.view','deliveries.update') where r.code = 'DRIVER'
on conflict do nothing;

create or replace function public.has_permission(required_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles profile
    where profile.id = auth.uid() and profile.is_active
      and not exists (select 1 from user_permission_overrides o where o.user_id = profile.id and o.permission_code = required_permission and not o.granted)
      and (
        exists (select 1 from user_permission_overrides o where o.user_id = profile.id and o.permission_code = required_permission and o.granted)
        or exists (
          select 1 from user_roles ur
          join role_permissions rp on rp.role_id = ur.role_id
          where ur.user_id = profile.id and rp.permission_code = required_permission
        )
      )
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  initial_admin_email constant text := 'dembadiakite839@gmail.com';
  assigned_role text := case when lower(new.email) = initial_admin_email then 'ADMIN' else 'CUSTOMER' end;
begin
  insert into public.profiles (id, email, full_name, phone, account_type)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.raw_user_meta_data ->> 'phone', assigned_role)
  on conflict (id) do nothing;

  if assigned_role = 'ADMIN' then
    insert into public.user_roles (user_id, role_id)
    select new.id, id from public.roles where code = 'ADMIN'
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

insert into public.profiles (id, email, full_name, phone, account_type)
select id, lower(email), coalesce(raw_user_meta_data ->> 'full_name', ''), raw_user_meta_data ->> 'phone',
  case when lower(email) = 'dembadiakite839@gmail.com' then 'ADMIN' else 'CUSTOMER' end
from auth.users
on conflict (id) do nothing;

insert into public.user_roles (user_id, role_id)
select profile.id, role.id
from public.profiles profile join public.roles role on role.code = 'ADMIN'
where profile.email = 'dembadiakite839@gmail.com'
on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;

create policy "profiles_read_own_or_employees" on public.profiles for select to authenticated using (id = auth.uid() or public.has_permission('employees.view'));
create policy "roles_read_authorized" on public.roles for select to authenticated using (public.has_permission('employees.view'));
create policy "permissions_read_authorized" on public.permissions for select to authenticated using (public.has_permission('employees.view'));
create policy "user_roles_read_authorized" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_permission('employees.view'));
create policy "role_permissions_read_authorized" on public.role_permissions for select to authenticated using (public.has_permission('employees.view'));
create policy "overrides_read_authorized" on public.user_permission_overrides for select to authenticated using (user_id = auth.uid() or public.has_permission('employees.view'));

/* Employee administration is intentionally server-only. Direct browser writes are denied. */
revoke all on public.profiles, public.roles, public.permissions, public.user_roles, public.role_permissions, public.user_permission_overrides from anon, authenticated;
grant select on public.profiles, public.roles, public.permissions, public.user_roles, public.role_permissions, public.user_permission_overrides to authenticated;
