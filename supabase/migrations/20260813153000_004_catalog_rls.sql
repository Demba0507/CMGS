/* Catalog RLS: public users consume get_public_products(), never products directly. */

drop policy if exists "anon_select_products" on public.products;
drop policy if exists "anon_insert_products" on public.products;
drop policy if exists "anon_update_products" on public.products;
drop policy if exists "anon_delete_products" on public.products;

create policy "products_select_authorized" on public.products for select to authenticated using (public.has_permission('products.view'));
create policy "products_insert_authorized" on public.products for insert to authenticated with check (public.has_permission('products.create'));
create policy "products_update_authorized" on public.products for update to authenticated using (public.has_permission('products.edit')) with check (public.has_permission('products.edit'));
create policy "products_delete_authorized" on public.products for delete to authenticated using (public.has_permission('products.delete'));

drop policy if exists "anon_crud_categories" on public.categories;
drop policy if exists "anon_insert_categories" on public.categories;
drop policy if exists "anon_update_categories" on public.categories;
drop policy if exists "anon_delete_categories" on public.categories;

create policy "categories_public_read" on public.categories for select to anon, authenticated using (true);
create policy "categories_insert_authorized" on public.categories for insert to authenticated with check (public.has_permission('products.create'));
create policy "categories_update_authorized" on public.categories for update to authenticated using (public.has_permission('products.edit')) with check (public.has_permission('products.edit'));
create policy "categories_delete_authorized" on public.categories for delete to authenticated using (public.has_permission('products.delete'));

drop policy if exists "anon_select_suppliers" on public.suppliers;
drop policy if exists "anon_insert_suppliers" on public.suppliers;
drop policy if exists "anon_update_suppliers" on public.suppliers;
drop policy if exists "anon_delete_suppliers" on public.suppliers;

create policy "suppliers_select_authorized" on public.suppliers for select to authenticated using (public.has_permission('suppliers.view'));
create policy "suppliers_insert_authorized" on public.suppliers for insert to authenticated with check (public.has_permission('suppliers.create'));
create policy "suppliers_update_authorized" on public.suppliers for update to authenticated using (public.has_permission('suppliers.edit')) with check (public.has_permission('suppliers.edit'));
create policy "suppliers_delete_admin_only" on public.suppliers for delete to authenticated using (public.has_permission('settings.manage'));

drop policy if exists "anon_select_stockmov" on public.stock_movements;
drop policy if exists "anon_insert_stockmov" on public.stock_movements;
drop policy if exists "anon_update_stockmov" on public.stock_movements;
drop policy if exists "anon_delete_stockmov" on public.stock_movements;

create policy "stock_movements_select_authorized" on public.stock_movements for select to authenticated using (public.has_permission('stock.view'));
create policy "stock_movements_insert_authorized" on public.stock_movements for insert to authenticated with check (public.has_permission('stock.edit'));

revoke all on public.products, public.suppliers, public.stock_movements from anon;
grant select, insert, update, delete on public.products, public.suppliers, public.stock_movements to authenticated;
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;

