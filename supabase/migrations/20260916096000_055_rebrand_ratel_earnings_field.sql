/*
  Rebranding demandé par Demba : l'application s'appelait CMGS Commerce,
  elle s'appelle désormais RATEL.

  get_period_financials() renvoie une colonne nommée cmgs_earnings dans son
  RETURNS TABLE. PostgreSQL n'autorise pas CREATE OR REPLACE FUNCTION pour
  changer le nom d'une colonne de retour (le type de retour doit rester
  identique) : il faut DROP puis CREATE. Comportement et calcul strictement
  identiques, seul le nom de la colonne change (cmgs_earnings -> ratel_earnings).
*/

drop function if exists public.get_period_financials(uuid);

create function public.get_period_financials(p_period_id uuid default null)
returns table (
  period_id uuid, period_label text, period_status text,
  sales_amount bigint, purchase_amount bigint, supplier_savings bigint, gross_margin bigint,
  delivery_fees bigint, supplier_commission bigint, ratel_earnings bigint,
  orders_count bigint, cancelled_count bigint
)
language plpgsql security definer set search_path = public
as $$
declare
  target_period uuid;
  commission_bp bigint;
begin
  if not (public.has_permission('statistics.view') or public.has_permission('accounting.view')) then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  target_period := p_period_id;
  if target_period is null then
    select id into target_period from public.accounting_periods where status = 'OPEN' limit 1;
  end if;

  select coalesce((value)::text, '1')::bigint into commission_bp from public.settings where key = 'commerce.commission_rate_bp';
  commission_bp := coalesce(commission_bp, 1);

  return query
  select
    ap.id, ap.label, ap.status,
    coalesce(sum(oi.unit_price * oi.quantity) filter (where o.status <> 'CANCELLED'), 0)::bigint,
    coalesce(sum(oi.supplier_price * oi.quantity) filter (where o.status <> 'CANCELLED'), 0)::bigint,
    coalesce(sum(greatest(oi.supplier_initial_price - oi.supplier_price, 0) * oi.quantity) filter (where o.status <> 'CANCELLED'), 0)::bigint,
    coalesce(sum((oi.unit_price - oi.supplier_price) * oi.quantity) filter (where o.status <> 'CANCELLED'), 0)::bigint,
    coalesce((select sum(o2.delivery_fee) from public.orders o2 where o2.accounting_period_id = ap.id and o2.status <> 'CANCELLED'), 0)::bigint,
    floor(coalesce(sum(oi.supplier_price * oi.quantity) filter (where o.status <> 'CANCELLED'), 0) * commission_bp / 10000.0)::bigint,
    (coalesce(sum((oi.unit_price - oi.supplier_price) * oi.quantity) filter (where o.status <> 'CANCELLED'), 0)
      + floor(coalesce(sum(oi.supplier_price * oi.quantity) filter (where o.status <> 'CANCELLED'), 0) * commission_bp / 10000.0)
      + coalesce((select sum(o3.delivery_fee) from public.orders o3 where o3.accounting_period_id = ap.id and o3.status <> 'CANCELLED'), 0))::bigint,
    (select count(*) from public.orders o4 where o4.accounting_period_id = ap.id and o4.status <> 'CANCELLED')::bigint,
    (select count(*) from public.orders o5 where o5.accounting_period_id = ap.id and o5.status = 'CANCELLED')::bigint
  from public.accounting_periods ap
  left join public.orders o on o.accounting_period_id = ap.id
  left join public.order_items oi on oi.order_id = o.id
  where ap.id = target_period
  group by ap.id, ap.label, ap.status;
end;
$$;
revoke all on function public.get_period_financials(uuid) from public;
grant execute on function public.get_period_financials(uuid) to authenticated;
