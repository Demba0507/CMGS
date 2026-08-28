/*
  Étape 4 du cahier des charges de corrections CMGS — Confirmation des actions
  sensibles. Cette étape est presque entièrement côté interface (un composant
  de dialogue réutilisable, cf. src/lib/confirm.tsx) et n'a normalement pas
  besoin de migration.

  Mais l'audit préalable exigé par le §17 a révélé une régression existante,
  sans rapport avec les confirmations, mais qui aurait empêché de tester la
  confirmation de suppression d'un livreur : la migration 015 avait retiré les
  anciennes policies permissives (anon_insert_drivers, anon_update_drivers,
  anon_delete_drivers) lors du durcissement de la sécurité, sans les remplacer
  par des policies pour les utilisateurs authentifiés. Résultat : plus personne,
  pas même un administrateur, ne pouvait créer, modifier ou supprimer un
  livreur via l'API — la page Livreurs du Dashboard était cassée en silence.

  Cette migration corrige uniquement cet oubli, avec le même niveau d'exigence
  que le reste du module livraisons (permission deliveries.assign, déjà
  existante et déjà réservée à l'administrateur par défaut).
*/

drop policy if exists "drivers_insert_authorized" on public.drivers;
create policy "drivers_insert_authorized" on public.drivers
  for insert to authenticated
  with check (public.has_permission('deliveries.assign'));

drop policy if exists "drivers_update_authorized" on public.drivers;
create policy "drivers_update_authorized" on public.drivers
  for update to authenticated
  using (public.has_permission('deliveries.assign'))
  with check (public.has_permission('deliveries.assign'));

drop policy if exists "drivers_delete_authorized" on public.drivers;
create policy "drivers_delete_authorized" on public.drivers
  for delete to authenticated
  using (public.has_permission('deliveries.assign'));

grant insert, update, delete on public.drivers to authenticated;
