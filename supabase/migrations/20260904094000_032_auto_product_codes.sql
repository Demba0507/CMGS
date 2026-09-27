/*
  Étape 12 du prompt d'amélioration — Code produit auto-attribué (§19).

  Règle : l'utilisateur ne doit jamais saisir le code produit. Il doit être
  recalculé automatiquement (P1, P2, P3...) selon la position, tout en
  gardant products.id (UUID) comme identifiant interne stable — jamais
  cassé même si le code affiché change. Comme order_items.product_code
  est déjà un instantané texte pris au moment de la commande (indépendant
  de products.code, voir schéma initial), recalculer products.code
  librement ici n'affecte jamais l'historique des commandes (§52).

  Mécanique choisie : plutôt qu'un compteur figé à la création (qui ne
  se re-numéroterait jamais si un produit est supprimé plus tard, à
  l'inverse de l'exemple du §19 : "Si P1 est supprimé, UUID B -> P1"),
  le code est recalculé pour TOUS les produits à chaque insertion/
  suppression, ordonné par date de création. Pas de colonne supplémentaire,
  aucune requête existante à changer (products.code reste un champ texte
  normal, juste maintenu par trigger plutôt que par le formulaire).

  1) Un trigger BEFORE INSERT attribue un code temporaire unique (pour
     satisfaire la contrainte UNIQUE NOT NULL existante avant renumérotation) —
     la valeur envoyée par le frontend, s'il en envoie une, est ignorée.
  2) Un trigger AFTER INSERT/DELETE (niveau instruction, une seule passe
     même pour un insert en masse) renumérote tous les produits.
  3) SECURITY DEFINER : la renumérotation ne doit pas dépendre de la
     permission products.edit de l'utilisateur qui vient de créer le
     produit avec products.create seulement — cohérent avec le reste
     des RPC du projet.
  4) Backfill immédiat des produits déjà existants.
*/

create or replace function public.renumber_product_codes()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.products p
  set code = sub.new_code
  from (
    select id, 'P' || row_number() over (order by created_at, id) as new_code
    from public.products
  ) sub
  where p.id = sub.id and p.code is distinct from sub.new_code;
end;
$$;
revoke all on function public.renumber_product_codes() from public;

create or replace function public.assign_temp_product_code()
returns trigger
language plpgsql
as $$
begin
  -- Toujours écrasé : le code final est décidé par renumber_product_codes()
  -- juste après. Cette valeur ne sert qu'à passer la contrainte UNIQUE NOT NULL
  -- le temps de l'instruction. Ignore volontairement toute valeur envoyée par
  -- le client (§19 : l'utilisateur ne saisit jamais le code).
  new.code := 'TMP-' || replace(gen_random_uuid()::text, '-', '');
  return new;
end;
$$;

drop trigger if exists trg_assign_temp_product_code on public.products;
create trigger trg_assign_temp_product_code
  before insert on public.products
  for each row execute function public.assign_temp_product_code();

create or replace function public.trigger_renumber_products()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.renumber_product_codes();
  return null;
end;
$$;

drop trigger if exists trg_renumber_products_insert on public.products;
create trigger trg_renumber_products_insert
  after insert on public.products
  for each statement execute function public.trigger_renumber_products();

drop trigger if exists trg_renumber_products_delete on public.products;
create trigger trg_renumber_products_delete
  after delete on public.products
  for each statement execute function public.trigger_renumber_products();

-- Backfill : remet immédiatement en ordre tous les produits déjà existants.
select public.renumber_product_codes();
