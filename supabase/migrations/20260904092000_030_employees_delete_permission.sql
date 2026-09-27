/*
  Étape 8 du prompt d'amélioration — Suppression réelle des comptes Supabase
  Auth (§41/§42). Diagnostiqué à l'étape 2 de l'audit : aucune fonction
  n'appelait jamais auth.admin.deleteUser() nulle part dans le projet — les
  employés ne pouvaient être que désactivés (profiles.is_active = false),
  et purge_customer/purge_driver ne supprimaient que la ligne
  customers/drivers, jamais le compte Auth lié (customers.user_id /
  drivers.user_id restaient orphelins).

  Cette migration ajoute uniquement la permission granulaire dédiée
  (employees.delete), accordée à l'ADMIN par défaut, comme pour
  customers.delete/suppliers.delete/drivers.delete/conversations.delete.
  La suppression elle-même doit passer par une Supabase Edge Function
  côté serveur (jamais une clé service-role côté frontend, §51) : voir
  supabase/functions/delete-user-account. Cette RPC ne fait qu'exposer la
  permission pour que l'Edge Function puisse la vérifier via le client
  authentifié de l'appelant, exactement comme has_permission() est déjà
  utilisé partout ailleurs dans l'application.

  Note technique importante ayant guidé la conception de l'Edge Function :
  public.profiles.id référence auth.users(id) ON DELETE RESTRICT (migration
  002). Il est donc impossible d'appeler auth.admin.deleteUser() tant que la
  ligne profiles correspondante existe encore — l'Edge Function doit
  supprimer la ligne profiles AVANT de supprimer le compte Auth. Vérifié que
  toutes les autres tables référençant profiles.id le font en ON DELETE SET
  NULL (jamais RESTRICT/CASCADE en dehors de user_roles/
  user_permission_overrides), donc cette suppression ne casse aucun
  historique : commandes, logs d'audit, conversations assignées, etc.
  conservent leurs données, seule la référence à l'auteur devient NULL —
  exactement ce que demande le §52 (préserver l'historique commercial).

  Additive uniquement.
*/

insert into public.permissions (code, name, description) values
  ('employees.delete', 'Supprimer un compte utilisateur', 'Autorise la suppression définitive du compte Supabase Auth et du profil d''un employé')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select r.id, 'employees.delete' from public.roles r where r.code = 'ADMIN'
on conflict do nothing;
