/*
  Public catalog boundary.
  Customers can only read the explicitly returned commercial fields; supplier cost,
  supplier identity and exact stock remain inaccessible through this RPC.
*/

create or replace function public.get_public_products()
returns table (
  id uuid,
  code text,
  name text,
  description text,
  category_id uuid,
  sale_price bigint,
  image_url text,
  status text,
  in_stock boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.code, p.name, p.description, p.category_id, p.sale_price, p.image_url,
    p.status, (p.stock_verified > 0) as in_stock, p.created_at, p.updated_at
  from public.products p
  where p.status = 'ACTIVE';
$$;

grant execute on function public.get_public_products() to anon, authenticated;

