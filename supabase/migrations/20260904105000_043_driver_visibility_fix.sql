/*
  Étape 25 du prompt d'amélioration — Amélioration gestion livreurs (§30/§31).

  Bug majeur trouvé en vérifiant pourquoi "l'interface livreur doit être
  très simple" (§30) : DriverPage.tsx interroge orders/customers/payments
  sans filtre, en comptant sur RLS pour ne renvoyer que ce qui concerne le
  livreur connecté — exactement comme ça fonctionne déjà pour `deliveries`
  (deliveries_select_own_driver, migration 023).

  Mais AUCUNE policy équivalente n'existe sur orders, customers ou
  payments pour le rôle livreur. Seules existent : l'accès staff
  (orders.view / customers.view / payments.view) et l'accès "propre
  client" (customer.user_id = auth.uid()). Un livreur n'est ni l'un ni
  l'autre : RLS bloque tout, et les trois requêtes renvoient 0 ligne.

  Conséquence concrète : un livreur ouvrant "Mes livraisons" voit ses
  cartes de livraison, mais SANS code de commande, SANS nom client, SANS
  téléphone, SANS montant ni mode de paiement — l'app livreur affichait
  des tirets partout. Pas un problème de design, un vrai trou de policy
  qui rend la fonctionnalité inutilisable en pratique.

  Correction : même principe que deliveries_select_own_driver — un
  livreur peut voir une commande, son client et son paiement UNIQUEMENT
  s'il a une livraison qui lui est assignée pour cette commande. Rien de
  plus large (pas d'accès aux commandes non assignées).
*/

create policy "orders_select_own_driver" on public.orders for select to authenticated
  using (id in (select order_id from public.deliveries where driver_id in (select id from public.drivers where user_id = auth.uid() and deleted_at is null)));

create policy "customers_select_own_driver" on public.customers for select to authenticated
  using (id in (
    select o.customer_id from public.orders o
    join public.deliveries d on d.order_id = o.id
    where d.driver_id in (select id from public.drivers where user_id = auth.uid() and deleted_at is null)
  ));

create policy "payments_select_own_driver" on public.payments for select to authenticated
  using (order_id in (select order_id from public.deliveries where driver_id in (select id from public.drivers where user_id = auth.uid() and deleted_at is null)));
