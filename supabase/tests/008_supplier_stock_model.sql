do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'low_stock_threshold') then raise exception 'Missing product low stock threshold'; end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'product_suppliers') then raise exception 'Missing product_suppliers table'; end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'supplier_stock_reports') then raise exception 'Missing supplier_stock_reports table'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'product_suppliers_one_primary') then raise exception 'Missing one-primary-supplier constraint'; end if;
end;
$$;
