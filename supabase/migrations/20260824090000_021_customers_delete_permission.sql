/*
  Étape 3 du cahier des charges de corrections CMGS — Suppression des clients.
  Additive uniquement : aucune table/colonne/permission existante n'est retirée.

  1) Nouvelle permission granulaire `customers.delete` (jusqu'ici la suppression
     d'un client était gardée par `settings.manage`, une permission trop large
     et sans rapport fonctionnel avec la gestion des clients).
  2) RPC `delete_customer()` : seul point d'entrée autorisé pour supprimer un
     client. Vérifie la permission côté serveur (pas seulement côté UI),
     journalise l'action via `log_audit_event()` déjà existant, et renvoie un
     message métier clair en cas de refus.
  3) La suppression directe via l'API REST (`.from('customers').delete()`) est
     révoquée : seule la RPC — qui applique la vérification — peut supprimer.
  4) RPC `get_my_permissions()` : permet à l'interface de savoir quelles actions
     proposer à l'utilisateur connecté, sans exposer les tables internes
     `role_permissions` / `user_roles` (déjà réservées à `employees.view`).
     Cette fonction est réutilisée par les futures étapes (confirmations,
     masquage cohérent des actions sensibles).
*/

-- ============ PERMISSION ============
insert into public.permissions (code, name, description) values
  ('customers.delete', 'Supprimer les clients', 'Autorise la suppression définitive d''une fiche client')
on conflict (code) do update set name = excluded.name, description = excluded.description;

-- Accordée à l'administrateur uniquement par défaut (action sensible).
-- Un administrateur peut ensuite l'accorder à d'autres employés via
-- Dashboard → Employés → Permissions (overrides), sans modification de code.
insert into public.role_permissions (role_id, permission_code)
select r.id, 'customers.delete' from public.roles r where r.code = 'ADMIN'
on conflict do nothing;

-- ============ RLS : remplace la garde générique settings.manage ============
drop policy if exists "customers_delete_admin" on public.customers;
drop policy if exists "customers_delete_authorized" on public.customers;
create policy "customers_delete_authorized" on public.customers
  for delete to authenticated
  using (public.has_permission('customers.delete'));

-- Suppression forcée à passer par la RPC delete_customer() : un appel REST
-- direct (`.from('customers').delete()`) est désormais impossible même pour
-- un rôle qui aurait la permission, ce qui évite qu'un bouton masqué soit la
-- seule protection (§17 du cahier des charges).
revoke delete on public.customers from authenticated;

-- ============ RPC : SUPPRESSION SÉCURISÉE D'UN CLIENT ============
create or replace function public.delete_customer(p_customer_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.customers;
begin
  if not public.has_permission('customers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas supprimer de client.';
  end if;

  select * into existing from public.customers where id = p_customer_id;
  if not found then
    raise exception using errcode = '22023', message = 'Client introuvable.';
  end if;

  delete from public.customers where id = p_customer_id;

  perform public.log_audit_event('CUSTOMER_DELETED', 'customer', p_customer_id,
    'Client supprimé : ' || existing.name, to_jsonb(existing), null);
end;
$$;

revoke all on function public.delete_customer(uuid) from public;
grant execute on function public.delete_customer(uuid) to authenticated;

-- ============ RPC : PERMISSIONS DE L'UTILISATEUR CONNECTÉ ============
create or replace function public.get_my_permissions()
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(p.code order by p.code), '{}'::text[])
  from public.permissions p
  where public.has_permission(p.code);
$$;

revoke all on function public.get_my_permissions() from public;
grant execute on function public.get_my_permissions() to authenticated;
