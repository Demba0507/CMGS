/*
  Corrige la correction complète CMGS — Étape 5 (§27 du prompt maître).

  Ce test vérifiait l'ANCIEN modèle "stock déclaré / stock vérifié" avec
  circuit de vérification téléphonique fournisseur (supplier_stock_reports,
  product_suppliers.verified_stock/declared_stock). Ce circuit a été retiré
  intentionnellement par la migration 033_single_stock_field.sql au profit
  d'un champ unique products.stock, modifiable directement par CMGS — voir
  le commentaire de cette migration pour le détail de la décision.

  Le test est donc adapté au modèle actuel (et non l'inverse : le modèle
  actuel n'est pas modifié pour faire passer l'ancien test). Il vérifie :
  - que le champ de stock unique existe bien sur products (et que l'ancien
    couple declared/verified a bien disparu, en garde de non-régression) ;
  - que le seuil de stock faible existe toujours ;
  - que product_suppliers existe toujours (comparaison de prix fournisseurs,
    fonctionnalité conservée — voir 033) avec sa contrainte "un seul
    fournisseur principal par produit" ;
  - que l'ancienne table de rapports de stock fournisseur a bien disparu.
*/
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'stock') then
    raise exception 'Missing products.stock (single stock field)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name in ('stock_declared', 'stock_verified')) then
    raise exception 'Obsolete declared/verified stock columns still present on products';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'low_stock_threshold') then
    raise exception 'Missing product low stock threshold';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'product_suppliers') then
    raise exception 'Missing product_suppliers table';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'product_suppliers' and column_name in ('declared_stock', 'verified_stock', 'last_verified_at')) then
    raise exception 'Obsolete declared/verified stock columns still present on product_suppliers';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'supplier_stock_reports') then
    raise exception 'Obsolete supplier_stock_reports table still present';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'product_suppliers_one_primary') then
    raise exception 'Missing one-primary-supplier constraint';
  end if;
end;
$$;
