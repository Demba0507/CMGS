/* Additive supplier/product and stock declaration model. Existing product history remains intact. */

alter table public.products add column if not exists brand text;
alter table public.products add column if not exists low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0);
alter table public.products add column if not exists initial_supplier_price bigint not null default 0 check (initial_supplier_price >= 0);
alter table public.products add column if not exists purchase_price bigint not null default 0 check (purchase_price >= 0);

create table if not exists public.product_suppliers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  is_primary boolean not null default false,
  initial_supplier_price bigint not null default 0 check (initial_supplier_price >= 0),
  purchase_price bigint not null default 0 check (purchase_price >= 0),
  declared_stock integer not null default 0 check (declared_stock >= 0),
  verified_stock integer not null default 0 check (verified_stock >= 0),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, supplier_id)
);
create unique index if not exists product_suppliers_one_primary on public.product_suppliers(product_id) where is_primary;
create index if not exists product_suppliers_supplier_idx on public.product_suppliers(supplier_id);

create table if not exists public.supplier_stock_reports (
  id uuid primary key default gen_random_uuid(),
  product_supplier_id uuid not null references public.product_suppliers(id) on delete cascade,
  declared_stock integer not null check (declared_stock >= 0),
  verified_stock integer check (verified_stock is null or verified_stock >= 0),
  reported_at timestamptz not null default now(),
  verified_at timestamptz,
  reported_by uuid references public.profiles(id) on delete set null,
  verified_by uuid references public.profiles(id) on delete set null,
  note text
);
create index if not exists supplier_stock_reports_product_idx on public.supplier_stock_reports(product_supplier_id, reported_at desc);

alter table public.product_suppliers enable row level security;
alter table public.supplier_stock_reports enable row level security;
create policy "product_suppliers_view" on public.product_suppliers for select to authenticated using (public.has_permission('suppliers.view') or public.has_permission('stock.view'));
create policy "product_suppliers_manage" on public.product_suppliers for all to authenticated using (public.has_permission('products.edit') or public.has_permission('stock.edit')) with check (public.has_permission('products.edit') or public.has_permission('stock.edit'));
create policy "stock_reports_view" on public.supplier_stock_reports for select to authenticated using (public.has_permission('stock.view'));
create policy "stock_reports_create" on public.supplier_stock_reports for insert to authenticated with check (public.has_permission('stock.edit') or public.has_permission('stock.verify'));
create policy "stock_reports_verify" on public.supplier_stock_reports for update to authenticated using (public.has_permission('stock.verify')) with check (public.has_permission('stock.verify'));

revoke all on public.product_suppliers, public.supplier_stock_reports from anon;
grant select, insert, update, delete on public.product_suppliers, public.supplier_stock_reports to authenticated;

