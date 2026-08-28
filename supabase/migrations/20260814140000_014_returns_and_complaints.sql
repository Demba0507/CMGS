/* Phase 6 — Retours et réclamations (cahier des charges §22-23, §45).
   `returns` existe déjà (migration 001) mais sans workflow ni UI. On ajoute les colonnes
   nécessaires pour distinguer les motifs qui donnent lieu à un retour fournisseur de ceux qui
   n'y donnent jamais lieu (§22), et un cycle de statut complet.
   `complaints` / `complaint_messages` sont nouvelles (n'existaient pas du tout). Additive uniquement. */

-- ============ RETOURS : COLONNES DE WORKFLOW ============
alter table public.returns add column if not exists reason_category text not null default 'OTHER'
  check (reason_category in ('DEFECTIVE', 'WRONG_ITEM', 'CHANGED_MIND', 'DELIVERY_REFUSED', 'OTHER'));
alter table public.returns add column if not exists route_to_supplier boolean not null default false;
alter table public.returns add column if not exists resolution text;
alter table public.returns add column if not exists resolved_by uuid references public.profiles(id) on delete set null;
alter table public.returns add column if not exists resolved_at timestamptz;
alter table public.returns add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Le statut par défaut existant ('REQUESTED') reste valide ; on documente le cycle complet ici.
alter table public.returns drop constraint if exists returns_status_check;
alter table public.returns add constraint returns_status_check
  check (status in ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED'));

-- ============ RETOURS : CRÉATION (client via son historique, ou employé) ============
create or replace function public.request_return(
  p_order_id uuid, p_order_item_id uuid, p_reason_category text, p_comment text default null
)
returns public.returns
language plpgsql security definer set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  item_row public.order_items%rowtype;
  is_owner boolean := false;
  created public.returns;
  computed_route boolean;
begin
  select * into order_row from public.orders where id = p_order_id;
  if not found then
    raise exception using errcode = '22023', message = 'Commande introuvable';
  end if;
  select * into item_row from public.order_items where id = p_order_item_id and order_id = p_order_id;
  if not found then
    raise exception using errcode = '22023', message = 'Article introuvable pour cette commande';
  end if;
  if p_reason_category not in ('DEFECTIVE', 'WRONG_ITEM', 'CHANGED_MIND', 'DELIVERY_REFUSED', 'OTHER') then
    raise exception using errcode = '22023', message = 'Motif invalide';
  end if;

  if auth.uid() is not null then
    select true into is_owner from public.customers where id = order_row.customer_id and user_id = auth.uid();
  end if;

  if not coalesce(is_owner, false) and not public.has_permission('orders.edit') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  -- Règle métier centralisée (§22) : seuls un produit défectueux ou une erreur de livraison
  -- donnent lieu à un retour fournisseur ; jamais un changement d'avis ou un refus de livraison.
  computed_route := p_reason_category in ('DEFECTIVE', 'WRONG_ITEM');

  insert into public.returns (order_id, order_item_id, product_id, supplier_id, reason, reason_category, route_to_supplier, comment, status, created_by)
  values (p_order_id, p_order_item_id, item_row.product_id, item_row.supplier_id, p_reason_category, p_reason_category, computed_route, p_comment, 'REQUESTED', auth.uid())
  returning * into created;

  perform public.log_audit_event('RETURN_REQUESTED', 'return', created.id, 'Retour demandé pour la commande ' || order_row.code, null, to_jsonb(created));
  insert into public.notifications (type, title, message, target_type, target_id)
  values ('RETURN_REQUESTED', 'Nouveau retour demandé', 'Retour demandé pour la commande ' || order_row.code, 'return', created.id);

  return created;
end;
$$;
revoke all on function public.request_return(uuid, uuid, text, text) from public;
grant execute on function public.request_return(uuid, uuid, text, text) to authenticated;

-- ============ RETOURS : DÉCISION ET RÉSOLUTION (employé) ============
create or replace function public.resolve_return(p_return_id uuid, p_status text, p_resolution text default null)
returns public.returns
language plpgsql security definer set search_path = public
as $$
declare
  previous_status text;
  target public.returns;
  updated public.returns;
begin
  if not public.has_permission('orders.edit') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if p_status not in ('APPROVED', 'REJECTED', 'COMPLETED') then
    raise exception using errcode = '22023', message = 'Statut invalide';
  end if;

  select * into target from public.returns where id = p_return_id;
  if not found then
    raise exception using errcode = '22023', message = 'Retour introuvable';
  end if;
  previous_status := target.status;

  update public.returns
  set status = p_status, resolution = coalesce(p_resolution, resolution), resolved_by = auth.uid(), resolved_at = now()
  where id = p_return_id
  returning * into updated;

  -- Un retour complété restitue la quantité au stock vendable, tracé comme les autres mouvements.
  if p_status = 'COMPLETED' and target.product_id is not null then
    update public.products set stock_verified = stock_verified + coalesce((select quantity from public.order_items where id = target.order_item_id), 0), updated_at = now()
    where id = target.product_id;
    insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
    select target.product_id, 'RELEASE', oi.quantity, p.stock_verified - oi.quantity, p.stock_verified, 'Retour complété ' || target.id
    from public.order_items oi, public.products p where oi.id = target.order_item_id and p.id = target.product_id;
  end if;

  perform public.log_audit_event('RETURN_RESOLVED', 'return', p_return_id, 'Retour ' || p_status, to_jsonb(previous_status), to_jsonb(p_status));
  return updated;
end;
$$;
revoke all on function public.resolve_return(uuid, text, text) from public;
grant execute on function public.resolve_return(uuid, text, text) to authenticated;

-- ============ RÉCLAMATIONS ============
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  channel text not null default 'SITE' check (channel in ('SITE', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'SIMULATOR')),
  subject text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  assigned_to uuid references public.profiles(id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_complaints_customer on public.complaints(customer_id);
create index if not exists idx_complaints_status on public.complaints(status);

create table if not exists public.complaint_messages (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  sender text not null check (sender in ('CUSTOMER', 'EMPLOYEE')),
  sender_id uuid references public.profiles(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_complaint_messages_complaint on public.complaint_messages(complaint_id, created_at);

alter table public.complaints enable row level security;
alter table public.complaint_messages enable row level security;

create policy "complaints_select_authorized" on public.complaints for select to authenticated using (public.has_permission('complaints.view'));
create policy "complaints_select_own" on public.complaints for select to authenticated
  using (customer_id in (select id from public.customers where user_id = auth.uid()));
create policy "complaint_messages_select_authorized" on public.complaint_messages for select to authenticated using (public.has_permission('complaints.view'));
create policy "complaint_messages_select_own" on public.complaint_messages for select to authenticated
  using (complaint_id in (select id from public.complaints where customer_id in (select id from public.customers where user_id = auth.uid())));

revoke all on public.complaints, public.complaint_messages from anon, authenticated;
grant select on public.complaints, public.complaint_messages to authenticated;

-- ============ RPC : CRÉER UNE RÉCLAMATION (client ou employé pour le compte d'un client) ============
create or replace function public.create_complaint(p_customer_id uuid, p_order_id uuid, p_subject text, p_message text, p_channel text default 'SITE')
returns public.complaints
language plpgsql security definer set search_path = public
as $$
declare
  is_owner boolean := false;
  created public.complaints;
begin
  if nullif(trim(p_subject), '') is null or nullif(trim(p_message), '') is null then
    raise exception using errcode = '22023', message = 'Objet et message obligatoires';
  end if;
  if p_channel not in ('SITE', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'SIMULATOR') then
    raise exception using errcode = '22023', message = 'Canal invalide';
  end if;

  if auth.uid() is not null then
    select true into is_owner from public.customers where id = p_customer_id and user_id = auth.uid();
  end if;
  if not coalesce(is_owner, false) and not public.has_permission('complaints.manage') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  insert into public.complaints (customer_id, order_id, channel, subject, status)
  values (p_customer_id, p_order_id, p_channel, trim(p_subject), 'OPEN')
  returning * into created;

  insert into public.complaint_messages (complaint_id, sender, sender_id, content)
  values (created.id, case when coalesce(is_owner, false) then 'CUSTOMER' else 'EMPLOYEE' end, auth.uid(), trim(p_message));

  perform public.log_audit_event('COMPLAINT_CREATED', 'complaint', created.id, 'Réclamation créée : ' || trim(p_subject), null, to_jsonb(created));
  insert into public.notifications (type, title, message, target_type, target_id)
  values ('NEW_COMPLAINT', 'Nouvelle réclamation', trim(p_subject), 'complaint', created.id);

  return created;
end;
$$;
revoke all on function public.create_complaint(uuid, uuid, text, text, text) from public;
grant execute on function public.create_complaint(uuid, uuid, text, text, text) to authenticated;

-- ============ RPC : RÉPONDRE À UNE RÉCLAMATION ============
create or replace function public.add_complaint_message(p_complaint_id uuid, p_content text)
returns public.complaint_messages
language plpgsql security definer set search_path = public
as $$
declare
  complaint_row public.complaints%rowtype;
  is_owner boolean := false;
  created public.complaint_messages;
begin
  if nullif(trim(p_content), '') is null then
    raise exception using errcode = '22023', message = 'Message vide';
  end if;
  select * into complaint_row from public.complaints where id = p_complaint_id;
  if not found then
    raise exception using errcode = '22023', message = 'Réclamation introuvable';
  end if;

  if auth.uid() is not null then
    select true into is_owner from public.customers where id = complaint_row.customer_id and user_id = auth.uid();
  end if;
  if not coalesce(is_owner, false) and not public.has_permission('complaints.manage') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;

  insert into public.complaint_messages (complaint_id, sender, sender_id, content)
  values (p_complaint_id, case when coalesce(is_owner, false) then 'CUSTOMER' else 'EMPLOYEE' end, auth.uid(), trim(p_content))
  returning * into created;

  update public.complaints set updated_at = now(), status = case when status = 'CLOSED' then 'IN_PROGRESS' else status end where id = p_complaint_id;

  return created;
end;
$$;
revoke all on function public.add_complaint_message(uuid, text) from public;
grant execute on function public.add_complaint_message(uuid, text) to authenticated;

-- ============ RPC : ASSIGNER / CHANGER LE STATUT D'UNE RÉCLAMATION (employé) ============
create or replace function public.update_complaint(p_complaint_id uuid, p_status text default null, p_assigned_to uuid default null, p_resolution text default null)
returns public.complaints
language plpgsql security definer set search_path = public
as $$
declare
  previous public.complaints;
  updated public.complaints;
begin
  if not public.has_permission('complaints.manage') then
    raise exception using errcode = '42501', message = 'Permission refusée';
  end if;
  if p_status is not null and p_status not in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') then
    raise exception using errcode = '22023', message = 'Statut invalide';
  end if;

  select * into previous from public.complaints where id = p_complaint_id;
  if not found then
    raise exception using errcode = '22023', message = 'Réclamation introuvable';
  end if;

  update public.complaints set
    status = coalesce(p_status, status),
    assigned_to = coalesce(p_assigned_to, assigned_to),
    resolution = coalesce(p_resolution, resolution),
    updated_at = now()
  where id = p_complaint_id
  returning * into updated;

  perform public.log_audit_event('COMPLAINT_UPDATED', 'complaint', p_complaint_id, 'Réclamation mise à jour', to_jsonb(previous), to_jsonb(updated));
  return updated;
end;
$$;
revoke all on function public.update_complaint(uuid, text, uuid, text) from public;
grant execute on function public.update_complaint(uuid, text, uuid, text) to authenticated;
