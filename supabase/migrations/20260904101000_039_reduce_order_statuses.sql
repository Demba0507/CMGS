/*
  Étape 21 du prompt d'amélioration — Statuts de commande réduits à
  exactement 5 (§25) : En attente, Confirmée, Livrée, Annulée, Retournée.

  Mapping des anciens statuts intermédiaires vers les 5 autorisés (aucune
  commande ne doit se retrouver avec un statut qui n'existe plus) :
  - PREPARING, READY_FOR_DELIVERY, OUT_FOR_DELIVERY → CONFIRMED
    (toujours "en cours de traitement", pas encore livrée — le detail fin
    de préparation/livraison reste suivi séparément par
    order_supplier_groups.status et deliveries.status, des workflows
    internes distincts qui ne sont pas concernés par cette règle : le
    prompt parle du statut de la commande cliente, pas du suivi logistique
    interne par fournisseur ou par livreur).
  - REFUNDED → RETURNED (le remboursement est la résolution d'un retour,
    pas un état distinct pour le client).

  Contrainte ajoutée en base (elle n'existait pas du tout avant — le
  statut n'était protégé que côté frontend, jamais au niveau de la table).
  Ne PAS refaire le mécanisme de transition ici : la réversibilité des
  statuts (§26) est traitée à l'étape suivante, pour ne pas mélanger les
  deux sujets dans un même commit.
*/

update public.orders set status = 'CONFIRMED' where status in ('PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY');
update public.orders set status = 'RETURNED' where status = 'REFUNDED';

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED', 'RETURNED'));
