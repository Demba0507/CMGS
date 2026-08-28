/*
  Étape 7 du cahier des charges de corrections CMGS — Renforcement du système
  de permissions.

  Le système RBAC (rôles, permissions, surcharges par employé, has_permission())
  existait déjà et était déjà utilisé de façon cohérente dans la majorité de
  l'application. L'audit préalable (§17) a identifié quatre familles de
  problèmes concrets, corrigées ici :

  1) PRIVILÈGE MAL CALIBRÉ : accorder ou retirer une permission à un employé,
     et changer son rôle, n'exigeaient que `employees.edit` — la même
     permission que modifier son nom ou son téléphone. N'importe quel
     utilisateur autorisé à éditer une fiche employé pouvait donc s'auto-
     accorder (ou accorder à un tiers) n'importe quelle permission du système,
     y compris `settings.manage`. Nouvelle permission dédiée
     `employees.permissions`, distincte de `employees.edit`, désormais exigée
     par set_employee_role / set_employee_permission_override /
     remove_employee_permission_override.

  2) CATÉGORIE ABSENTE : le cahier des charges demande explicitement de
     pouvoir contrôler au minimum « export » et « maintenance ». Aucune
     permission dédiée n'existait pour ces deux catégories (l'export utilisait
     implicitement la permission de consultation de la page, la maintenance
     empruntait `settings.manage`). Ajout de `data.export` et
     `maintenance.manage`.

  3) PERMISSION GÉNÉRIQUE MAL CIBLÉE : la suppression d'une notification
     exigeait `settings.manage` (réservé de facto à l'administrateur) alors
     que les employés autorisés à traiter les notifications (commandes,
     chat, livraisons) devraient pouvoir les nettoyer eux-mêmes. Alignée sur
     la permission déjà utilisée pour les marquer comme lues.

  4) TROU DE SÉCURITÉ LATENT : plusieurs tables (orders, order_items,
     payments, deliveries, messages, returns, conversations) autorisaient
     encore, au niveau des GRANT, une suppression directe via l'API REST pour
     quiconque détient `settings.manage` — alors qu'aucune fonctionnalité de
     l'application n'expose une suppression directe de ces données (et que la
     corbeille de conversations, ajoutée à l'étape 5, ne protège que le
     chemin RPC, pas un appel REST direct qui la contournerait entièrement).
     Un bouton absent de l'interface n'est pas une protection si le backend
     autorise encore l'opération : ces GRANT sont révoqués. Les RPC internes
     (SECURITY DEFINER) ne sont pas affectées par cette révocation.

  Additive/durcissant uniquement : aucune fonctionnalité utilisée par
  l'application n'est retirée.
*/

-- ============ 1) NOUVELLES PERMISSIONS DÉDIÉES ============
insert into public.permissions (code, name, description) values
  ('employees.permissions', 'Gérer les permissions des employés', 'Change le rôle d''un employé ou accorde/retire une permission individuelle — distinct de la simple modification de fiche'),
  ('data.export', 'Exporter les données', 'Autorise l''export CSV/PDF des listes du Dashboard'),
  ('maintenance.manage', 'Gérer la maintenance', 'Active le mode maintenance et gère les sauvegardes')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r cross join (values ('employees.permissions'), ('data.export'), ('maintenance.manage')) as p(code)
where r.code = 'ADMIN'
on conflict do nothing;

-- ============ 2) GESTION DES PERMISSIONS : PLUS SENSIBLE QUE L'ÉDITION DE FICHE ============
create or replace function public.set_employee_role(p_user_id uuid, p_role_code text)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  previous_role text;
  new_account_type text;
  updated public.profiles;
begin
  if not public.has_permission('employees.permissions') then
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

create or replace function public.set_employee_permission_override(p_user_id uuid, p_permission_code text, p_granted boolean)
returns public.user_permission_overrides
language plpgsql security definer set search_path = public
as $$
declare
  updated public.user_permission_overrides;
begin
  if not public.has_permission('employees.permissions') then
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
  if not public.has_permission('employees.permissions') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  delete from public.user_permission_overrides where user_id = p_user_id and permission_code = p_permission_code;
  perform public.log_audit_event('EMPLOYEE_PERMISSION_OVERRIDE_REMOVED', 'profile', p_user_id, 'Retour à la permission par défaut du rôle pour ' || p_permission_code, null, null);
end;
$$;
revoke all on function public.remove_employee_permission_override(uuid, text) from public;
grant execute on function public.remove_employee_permission_override(uuid, text) to authenticated;

-- ============ 3) MAINTENANCE : PERMISSION DÉDIÉE EN PLUS DE settings.manage ============
create or replace function public.create_backup_snapshot(p_reason text)
returns public.backups
language plpgsql security definer set search_path = public
as $$
declare
  created public.backups;
  snapshot_data jsonb;
  counts jsonb;
begin
  if not (public.has_permission('settings.manage') or public.has_permission('accounting.manage') or public.has_permission('maintenance.manage')) then
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

drop policy if exists "backups_select_authorized" on public.backups;
create policy "backups_select_authorized" on public.backups for select to authenticated
  using (public.has_permission('settings.manage') or public.has_permission('accounting.manage') or public.has_permission('maintenance.manage'));

-- Le mode maintenance est un paramètre parmi d'autres dans `settings` : on autorise maintenance.manage
-- comme alternative à settings.manage, uniquement pour cette clé précise (les autres paramètres système
-- restent réservés à settings.manage, inchangé). Le reste de la fonction est inchangé par rapport à
-- la version d'origine (migration 009), y compris la règle métier Orange Money et le suivi updated_by.
create or replace function public.update_setting(p_key text, p_value jsonb)
returns public.settings
language plpgsql security definer set search_path = public
as $$
declare
  previous public.settings;
  updated public.settings;
  is_maintenance_key boolean;
begin
  is_maintenance_key := (p_key = 'system.maintenance_mode');

  if not (public.has_permission('settings.manage') or (is_maintenance_key and public.has_permission('maintenance.manage'))) then
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

-- ============ 4) NOTIFICATIONS : SUPPRESSION ALIGNÉE SUR LA PERMISSION DE TRAITEMENT ============
drop policy if exists "notifications_delete_admin" on public.notifications;
create policy "notifications_delete_authorized" on public.notifications for delete to authenticated
  using (public.has_permission('orders.edit') or public.has_permission('chat.respond') or public.has_permission('deliveries.update'));

-- ============ 5) FERME UN TROU DE SÉCURITÉ LATENT ============
-- Aucune fonctionnalité de l'application ne supprime directement ces lignes (les suppressions
-- légitimes passent par des RPC SECURITY DEFINER, non affectées par ces REVOKE). Un appel REST
-- direct restait pourtant possible pour quiconque détenait settings.manage : fermé ici.
revoke delete on public.orders, public.order_items, public.payments, public.deliveries,
  public.messages, public.returns, public.conversations from authenticated;
