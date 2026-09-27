/*
  Correction complète CMGS — bug de sécurité critique découvert pendant les
  tests réels de l'étape 5 (scénario §17 : vérifier qu'une commande historique
  reste cohérente après suppression/renumérotation d'un produit).

  PROBLÈME (vérifié empiriquement sur une base rejouant les 50 migrations,
  avec un vrai utilisateur ADMIN authentifié) :

    select count(*) from orders;
    -- ERREUR : infinite recursion detected in policy for relation "orders"

  Cette erreur touche TOUTE lecture des tables orders/payments par TOUT
  utilisateur authentifié (admin, employé, livreur, client) — pas seulement le
  scénario testé. La migration 043 (visibilité livreur) a ajouté des policies
  qui subquerient orders/customers/deliveries alors que des policies
  "client propriétaire" pré-existantes (migration 011) subqueriaient déjà ces
  mêmes tables en sens inverse, créant DEUX cycles distincts :

  1) orders <-> customers :
     - "orders_select_own" (orders, 011) subquerie customers ;
     - "customers_select_own_driver" (customers, 043) subquerie orders.

  2) orders <-> deliveries :
     - "orders_select_own_driver" (orders, 043) subquerie deliveries ;
     - "deliveries_select_own" (deliveries, 011) subquerie orders (puis
       customers, ce qui recoupe aussi le cycle n°1).

  RLS combine TOUTES les policies permissives d'une table avec OR : le plan
  doit être construit pour l'expression combinée, donc la boucle se produit
  quel que soit le rôle de l'utilisateur (même un ADMIN avec orders.view est
  bloqué), indépendamment du fait qu'une policy plus simple aurait suffi.

  CORRECTION : même principe que le reste du projet pour ce genre de
  vérification transversale (cf. has_permission, create_public_checkout, etc.) —
  des fonctions SECURITY DEFINER qui effectuent elles-mêmes les jointures
  nécessaires. Une fonction SECURITY DEFINER s'exécute avec les privilèges de
  son propriétaire (celui qui applique les migrations, propriétaire des
  tables) : RLS ne s'applique donc pas à ses requêtes internes (comportement
  standard PostgreSQL, sauf FORCE ROW LEVEL SECURITY, non utilisé ici). Les
  policies "vue livreur" n'ont donc plus besoin d'appliquer RLS sur
  orders/customers/deliveries pour évaluer leur propre condition — les deux
  cycles sont rompus.

  Aucun changement de comportement fonctionnel : un livreur voit exactement
  les mêmes commandes/clients/paiements qu'avant (uniquement ceux d'une
  livraison qui lui est assignée), seule l'implémentation change.
*/

create or replace function public.is_order_visible_to_current_driver(p_order_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.deliveries d
    where d.order_id = p_order_id
      and d.driver_id in (
        select id from public.drivers where user_id = auth.uid() and deleted_at is null
      )
  );
$$;
revoke all on function public.is_order_visible_to_current_driver(uuid) from public;
grant execute on function public.is_order_visible_to_current_driver(uuid) to authenticated;

create or replace function public.is_customer_visible_to_current_driver(p_customer_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.orders o
    where o.customer_id = p_customer_id
      and public.is_order_visible_to_current_driver(o.id)
  );
$$;
revoke all on function public.is_customer_visible_to_current_driver(uuid) from public;
grant execute on function public.is_customer_visible_to_current_driver(uuid) to authenticated;

drop policy if exists "customers_select_own_driver" on public.customers;
create policy "customers_select_own_driver" on public.customers for select to authenticated
  using (public.is_customer_visible_to_current_driver(id));

drop policy if exists "orders_select_own_driver" on public.orders;
create policy "orders_select_own_driver" on public.orders for select to authenticated
  using (public.is_order_visible_to_current_driver(id));

drop policy if exists "payments_select_own_driver" on public.payments;
create policy "payments_select_own_driver" on public.payments for select to authenticated
  using (public.is_order_visible_to_current_driver(order_id));

