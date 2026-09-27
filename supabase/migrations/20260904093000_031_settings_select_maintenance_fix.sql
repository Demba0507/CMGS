/*
  Étape 10 du prompt d'amélioration — Cohérence permissions UI ↔ RPC (§35),
  bug trouvé en auditant les pages non encore vérifiées.

  update_setting() autorise déjà maintenance.manage (en plus de
  settings.manage) pour la clé 'system.maintenance_mode' précisément
  (migration 025). Mais la policy SELECT sur `settings` n'a jamais reçu
  la même exception : elle exige encore settings.manage pour TOUTE lecture,
  sans exception. Un employé à qui l'admin a accordé uniquement
  maintenance.manage (et pas settings.manage) peut donc bien créer des
  sauvegardes (backups_select/insert acceptent déjà maintenance.manage),
  mais MaintenancePage.tsx ne peut jamais afficher/trouver la ligne du
  mode maintenance pour la basculer : getAllSettings() échoue purement et
  simplement avant même d'atteindre le bouton. Le droit d'écrire existe,
  mais pas celui de lire ce qu'il faudrait écrire.

  Correction : même exception, côté lecture, strictement limitée à la
  clé 'system.maintenance_mode' — tous les autres paramètres système
  restent réservés à settings.manage, inchangé.
*/

drop policy if exists "settings_select_authorized" on public.settings;
create policy "settings_select_authorized" on public.settings for select to authenticated
  using (
    public.has_permission('settings.manage')
    or (key = 'system.maintenance_mode' and public.has_permission('maintenance.manage'))
  );
