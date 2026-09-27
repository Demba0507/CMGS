/*
  Étape 27 du prompt d'amélioration — Audit global des suppressions restantes (§50).

  Nettoyage cosmétique trouvé en vérifiant chaque suppression du projet :
  `orders_delete_admin` (migration 006) ne peut plus jamais s'exécuter —
  la migration 025 a déjà révoqué le privilège DELETE de base sur
  `orders` pour le rôle authenticated, ce qui rend n'importe quelle policy
  RLS de suppression sur cette table sans effet (RLS ne s'applique qu'aux
  opérations déjà permises par les GRANTs). C'est la protection voulue —
  aucune commande ne doit jamais être supprimable, seulement annulée
  (§64) — mais la policy elle-même est du code mort qui donne une fausse
  impression qu'une suppression directe reste possible. Retirée pour que
  l'état de la base reflète clairement l'intention.
*/

drop policy if exists "orders_delete_admin" on public.orders;
