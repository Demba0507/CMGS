/*
  Correction complète CMGS — Étape 5 (§19 du prompt maître) : renumérotation
  sûre des codes produits P1/P2/P3...

  PROBLÈME IDENTIFIÉ À L'AUDIT :
  renumber_product_codes() (définie en 032, redéfinie en 038) recalculait tous
  les codes en une seule instruction UPDATE :

    update products p set code = sub.new_code from (select ... row_number() ...) sub
    where p.id = sub.id and p.code is distinct from sub.new_code;

  Cette approche n'est PAS garantie sans conflit UNIQUE en PostgreSQL :
  products.code UNIQUE n'est pas DEFERRABLE (contrainte du schéma d'origine,
  001_cmgs_core_schema.sql), donc chaque changement de valeur est vérifié
  immédiatement au moment où PostgreSQL traite la ligne — pas seulement à la
  fin de l'instruction. Quand une suppression décale plusieurs codes (ex :
  P3 -> P2 pendant qu'une autre ligne passe de P4 -> P3), l'ordre dans lequel
  le moteur traite les lignes au sein d'une même instruction UPDATE n'est pas
  garanti par PostgreSQL : si la ligne visant "P3" est traitée avant que
  l'ancienne détentrice de "P3" ait libéré cette valeur, on obtient une
  violation "duplicate key value violates unique constraint products_code_key".
  C'est exactement le piège décrit par le prompt maître ("P2 -> P1 alors que
  P1 existe encore").

  CORRECTION : renumérotation en deux passes, comme demandé ("stratégie sûre
  avec codes temporaires"). D'abord toutes les lignes qui doivent changer sont
  basculées vers un code temporaire dérivé de leur UUID (garanti unique et de
  forme différente de "Pn", donc ne peut jamais entrer en collision avec un
  code réel ni avec un autre code temporaire). Ensuite, dans une seconde
  instruction indépendante, les codes finaux sont appliqués : à cet instant,
  aucune ligne ne détient plus de valeur "Pn" en double, donc l'ordre de
  traitement des lignes n'a plus d'importance — la sécurité ne dépend plus
  d'un comportement non garanti du moteur.

  Comportement fonctionnel inchangé (mêmes triggers, même déclenchement sur
  insert/delete/changement de corbeille, produits en corbeille toujours
  exclus) : seule l'implémentation interne devient sûre.
*/

create or replace function public.renumber_product_codes()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Passe 1 : les lignes dont le code doit changer basculent vers un code
  -- temporaire garanti unique (dérivé de leur propre UUID). Cette passe ne
  -- peut jamais provoquer de conflit, quel que soit l'ordre de traitement :
  -- chaque valeur temporaire est unique par construction.
  with target as (
    select id, 'P' || row_number() over (order by created_at, id) as new_code
    from public.products
    where deleted_at is null
  )
  update public.products p
  set code = 'TMP-' || replace(p.id::text, '-', '')
  from target t
  where p.id = t.id and p.code is distinct from t.new_code;

  -- Passe 2 : à cet instant, toute ligne encore à renuméroter est en code
  -- temporaire (jamais de la forme "Pn") et toute ligne inchangée détient déjà
  -- exactement son code cible. Les codes finaux peuvent donc être appliqués
  -- sans qu'aucune valeur "Pn" ne soit jamais détenue par deux lignes en même
  -- temps, dans n'importe quel ordre de traitement.
  with target as (
    select id, 'P' || row_number() over (order by created_at, id) as new_code
    from public.products
    where deleted_at is null
  )
  update public.products p
  set code = t.new_code
  from target t
  where p.id = t.id and p.code is distinct from t.new_code;
end;
$$;

-- Revalide immédiatement l'état actuel avec la version corrigée (idempotent :
-- ne change rien si les codes sont déjà cohérents).
select public.renumber_product_codes();

/*
  SECOND PROBLÈME IDENTIFIÉ EN TESTANT LE SCÉNARIO EXACT DEMANDÉ (§20/§52) :
  "P1 supprimé (mis en corbeille) -> P2 doit devenir P1".

  delete_product() se contentait de poser deleted_at = now(), en laissant le
  produit garder son ancien code ('P1') tant qu'il est en corbeille (il n'est
  pas encore purgé, juste caché de la boutique). Résultat vérifié par le test :
  au moment de la renumérotation, le code 'P1' est encore physiquement détenu
  par la ligne en corbeille (la contrainte UNIQUE s'applique à toutes les
  lignes de la table, corbeille comprise) — impossible d'attribuer 'P1' au
  produit qui devrait légitimement le récupérer -> violation UNIQUE garantie,
  et non plus seulement un risque d'ordre de traitement.

  CORRECTION : au moment de la mise en corbeille, le produit est immédiatement
  renommé vers un code de corbeille non conflictuel (jamais de la forme "Pn"),
  ce qui libère son numéro pour le reste du catalogue actif dès la suppression
  — cohérent avec le principe déjà appliqué pour les codes temporaires. La
  restauration (restore_product, inchangée) déclenche déjà renumber_product_codes()
  via le trigger existant sur deleted_at, qui attribuera alors au produit
  restauré sa position chronologique réelle parmi les produits actifs.
*/
create or replace function public.delete_product(p_product_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.products;
begin
  if not public.has_permission('products.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas supprimer de produit.';
  end if;

  select * into existing from public.products where id = p_product_id and deleted_at is null;
  if not found then
    raise exception using errcode = '22023', message = 'Produit introuvable ou déjà supprimé.';
  end if;

  -- Le code "Pn" est libéré immédiatement (jamais réutilisable par erreur pendant
  -- que le produit est en corbeille) afin qu'un autre produit actif puisse le
  -- reprendre dès la renumérotation déclenchée par ce même UPDATE.
  update public.products
  set deleted_at = now(), deleted_by = auth.uid(), code = 'TRASH-' || replace(id::text, '-', '')
  where id = p_product_id;

  perform public.log_audit_event('PRODUCT_DELETED', 'product', p_product_id,
    'Produit déplacé en corbeille : ' || existing.name, to_jsonb(existing), null);
end;
$$;
revoke all on function public.delete_product(uuid) from public;
grant execute on function public.delete_product(uuid) to authenticated;

