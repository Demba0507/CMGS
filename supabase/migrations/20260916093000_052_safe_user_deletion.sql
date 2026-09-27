/*
  Correction complète CMGS — Étape 6 (§15 du prompt maître) : suppression
  robuste des comptes utilisateurs.

  PROBLÈME IDENTIFIÉ À L'AUDIT (dans les deux Edge Functions delete-user et
  delete-user-account) : la suppression procédait en deux temps distincts,
  dans deux systèmes différents (base Postgres, puis API Admin Auth) :

    1) adminClient.from('profiles').delete()   -- Postgres
    2) adminClient.auth.admin.deleteUser(id)   -- API GoTrue, appel réseau séparé

  Si l'étape 2 échoue après que l'étape 1 a réussi (erreur réseau, rate limit,
  panne temporaire de l'API Auth...), le profil est déjà supprimé mais le
  compte Supabase Auth existe toujours : un utilisateur Auth orphelin, capable
  de se reconnecter, mais sans aucun profil, rôle ni permission — exactement
  le problème critique décrit par le prompt maître.

  Inverser l'ordre ("Auth d'abord, profil ensuite") ne suffisait pas tel quel :
  profiles.id référence auth.users(id) en ON DELETE RESTRICT, donc supprimer
  l'utilisateur Auth alors que sa ligne profiles existe encore aurait échoué
  avec une violation de contrainte.

  CORRECTION (stratégie transactionnelle plutôt que compensatoire) : la
  contrainte passe en ON DELETE CASCADE. La suppression Auth (auth.admin.
  deleteUser) déclenche alors, dans la MÊME opération PostgreSQL sous-jacente,
  la suppression automatique et atomique de la ligne profiles correspondante
  — il devient impossible d'obtenir l'un sans l'autre : soit les deux
  disparaissent ensemble, soit aucun des deux n'est touché si l'appel échoue
  avant d'atteindre la base. Aucun état intermédiaire orphelin n'est possible.

  Vérifié sans risque pour les données historiques : toutes les autres tables
  qui référencent profiles.id le font déjà en ON DELETE CASCADE (uniquement
  pour les tables de jonction user_roles/user_permission_overrides, qui n'ont
  aucun sens sans l'utilisateur) ou en ON DELETE SET NULL (pour les colonnes
  d'attribution historique comme assigned_by/reported_by/deleted_by...) —
  jamais pour une table de données commerciales (commandes, clients, produits).
  Supprimer un profil ne casse donc jamais l'historique métier : seule la
  référence à son auteur devient NULL, comme c'était déjà le cas avant cette
  correction.
*/

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
