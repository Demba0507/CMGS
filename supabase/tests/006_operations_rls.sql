/* Run in Supabase SQL editor after migration 006. */
do $$
declare
  table_name text;
begin
  for table_name in select unnest(array['customers','orders','order_items','payments','deliveries','conversations','messages','notifications','event_logs']) loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname like 'anon_%') then
      raise exception 'Anonymous policy remains on %', table_name;
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_select_authorized') then
    raise exception 'Orders authorization policy is missing';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payments' and policyname = 'payments_update_authorized') then
    raise exception 'Payments authorization policy is missing';
  end if;
end;
$$;
