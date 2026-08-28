/* Run with the Supabase SQL editor after migrations 002–005.
   These assertions fail loudly if the security boundary is incomplete. */
do $$
begin
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'create_public_checkout') then
    raise exception 'Missing secure checkout RPC';
  end if;
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_public_products') then
    raise exception 'Missing public catalog RPC';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'products_select_authorized') then
    raise exception 'Products RLS policy is missing';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'anon_select_products') then
    raise exception 'Anonymous direct product access remains enabled';
  end if;
end;
$$;

