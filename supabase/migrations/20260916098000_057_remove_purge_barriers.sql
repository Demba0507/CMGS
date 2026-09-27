/*
  Demande explicite de Demba : la suppression définitive (purge) depuis une
  corbeille ne doit être bloquée par AUCUNE condition — ni sauvegarde
  récente exigée, ni mot de passe. Toutes les fonctions purge_* imposaient
  jusqu'ici qu'une sauvegarde de moins d'1h existe avant d'autoriser la
  purge ; cette contrainte est retirée pour les 6 types d'éléments
  (clients, fournisseurs, livreurs, produits, conversations, commandes).

  Ce qui reste (volontairement, ce sont des garanties de cohérence des
  données et non des "obstacles" au sens de la demande) :
  - la vérification de permission (*.delete) ;
  - la vérification que l'élément est bien en corbeille avant de le purger ;
  - la trace d'audit de la purge (log_audit_event).
*/

create or replace function public.purge_customer(p_customer_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.customers;
begin
  if not public.has_permission('customers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;

  select * into existing from public.customers where id = p_customer_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Client introuvable en corbeille (déplacez-le en corbeille avant de le purger).';
  end if;

  delete from public.customers where id = p_customer_id;

  perform public.log_audit_event('CUSTOMER_PURGED', 'customer', p_customer_id,
    'Client supprimé définitivement : ' || existing.name, to_jsonb(existing), null);
end;
$$;

create or replace function public.purge_supplier(p_supplier_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.suppliers;
begin
  if not public.has_permission('suppliers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;

  select * into existing from public.suppliers where id = p_supplier_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Fournisseur introuvable en corbeille.';
  end if;

  delete from public.suppliers where id = p_supplier_id;

  perform public.log_audit_event('SUPPLIER_PURGED', 'supplier', p_supplier_id,
    'Fournisseur supprimé définitivement : ' || existing.name, to_jsonb(existing), null);
end;
$$;

create or replace function public.purge_driver(p_driver_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.drivers;
begin
  if not public.has_permission('drivers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;

  select * into existing from public.drivers where id = p_driver_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Livreur introuvable en corbeille.';
  end if;

  delete from public.drivers where id = p_driver_id;

  perform public.log_audit_event('DRIVER_PURGED', 'driver', p_driver_id,
    'Livreur supprimé définitivement : ' || existing.name, to_jsonb(existing), null);
end;
$$;

create or replace function public.purge_conversation(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.conversations;
begin
  if not public.has_permission('conversations.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : purge réservée aux utilisateurs autorisés à supprimer des conversations.';
  end if;

  select * into existing from public.conversations where id = p_conversation_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Conversation introuvable en corbeille.';
  end if;

  delete from public.conversations where id = p_conversation_id;

  perform public.log_audit_event('CONVERSATION_PURGED', 'conversation', p_conversation_id, 'Conversation supprimée définitivement', null, null);
end;
$$;

create or replace function public.purge_product(p_product_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.products;
begin
  if not public.has_permission('products.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;

  select * into existing from public.products where id = p_product_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Produit introuvable en corbeille (déplacez-le en corbeille avant de le purger).';
  end if;

  delete from public.products where id = p_product_id;

  perform public.log_audit_event('PRODUCT_PURGED', 'product', p_product_id,
    'Produit supprimé définitivement : ' || existing.name, to_jsonb(existing), null);
end;
$$;

create or replace function public.purge_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.orders%rowtype;
begin
  if not public.has_permission('orders.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée.';
  end if;

  select * into existing from public.orders where id = p_order_id and deleted_at is not null;
  if not found then
    raise exception using errcode = '22023', message = 'Commande introuvable en corbeille (déplacez-la en corbeille avant de la purger).';
  end if;

  delete from public.orders where id = p_order_id;

  perform public.log_audit_event('ORDER_PURGED', 'order', p_order_id, 'Commande supprimée définitivement : ' || existing.code, to_jsonb(existing), null);
end;
$$;
