/*
  Étape 6 du prompt d'amélioration — Correction suppression clients (§39),
  bug retrouvé en creusant toute la chaîne bouton → RPC → RLS → DB.

  CAUSE RÉELLE (pas un problème RLS ni de permission UI, mais de dépendance
  croisée entre deux permissions sans rapport) :

  Les RPC de suppression douce (delete_customer, delete_supplier,
  delete_driver, delete_conversation — migration 023) exigent toutes
  qu'une sauvegarde ait été créée il y a moins d'1h, sinon elles échouent
  avec « Aucune sauvegarde récente : créez-en une avant de supprimer. ».

  Or créer une sauvegarde (create_backup_snapshot, migrations 020/025)
  exige la permission settings.manage, accounting.manage ou
  maintenance.manage — des permissions sans rapport avec la suppression
  d'un client/fournisseur/livreur/conversation. Un employé auquel un
  administrateur a accordé uniquement customers.delete (le workflow prévu
  et documenté par la migration 021 elle-même) voit donc le bouton
  Supprimer, mais l'action échoue TOUJOURS pour lui : il n'a aucun moyen de
  satisfaire la précondition. Même un ADMIN est bloqué dès qu'aucune
  sauvegarde manuelle n'a été faite dans l'heure précédente, ce qui est le
  cas la majorité du temps en usage réel. C'est la cause du message
  « Impossible de supprimer ce client » remonté au §39/§40.

  CORRECTION : la sauvegarde récente reste exigée uniquement pour les
  suppressions DÉFINITIVES et irréversibles (purge_customer, purge_supplier,
  purge_driver, purge_conversation, close_accounting_period) — c'est là
  qu'un filet de sécurité a un sens. Pour les suppressions simples, qui ne
  font que déplacer l'élément en corbeille (entièrement réversible via
  restore_*), cette précondition est disproportionnée et retirée. Rien
  d'autre ne change dans ces fonctions (permissions, audit log, messages
  d'erreur identiques). Additive/corrective uniquement, aucune donnée
  supprimée.
*/

create or replace function public.delete_customer(p_customer_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.customers;
begin
  if not public.has_permission('customers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas supprimer de client.';
  end if;

  select * into existing from public.customers where id = p_customer_id and deleted_at is null;
  if not found then
    raise exception using errcode = '22023', message = 'Client introuvable ou déjà supprimé.';
  end if;

  update public.customers set deleted_at = now(), deleted_by = auth.uid() where id = p_customer_id;

  perform public.log_audit_event('CUSTOMER_DELETED', 'customer', p_customer_id,
    'Client déplacé en corbeille : ' || existing.name, to_jsonb(existing), null);
end;
$$;
revoke all on function public.delete_customer(uuid) from public;
grant execute on function public.delete_customer(uuid) to authenticated;

create or replace function public.delete_supplier(p_supplier_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.suppliers;
begin
  if not public.has_permission('suppliers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas supprimer de fournisseur.';
  end if;

  select * into existing from public.suppliers where id = p_supplier_id and deleted_at is null;
  if not found then
    raise exception using errcode = '22023', message = 'Fournisseur introuvable ou déjà supprimé.';
  end if;

  update public.suppliers set deleted_at = now(), deleted_by = auth.uid() where id = p_supplier_id;

  perform public.log_audit_event('SUPPLIER_DELETED', 'supplier', p_supplier_id,
    'Fournisseur déplacé en corbeille : ' || existing.name, to_jsonb(existing), null);
end;
$$;
revoke all on function public.delete_supplier(uuid) from public;
grant execute on function public.delete_supplier(uuid) to authenticated;

create or replace function public.delete_driver(p_driver_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  existing public.drivers;
begin
  if not public.has_permission('drivers.delete') then
    raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas supprimer de livreur.';
  end if;

  select * into existing from public.drivers where id = p_driver_id and deleted_at is null;
  if not found then
    raise exception using errcode = '22023', message = 'Livreur introuvable ou déjà supprimé.';
  end if;

  update public.drivers set deleted_at = now(), deleted_by = auth.uid() where id = p_driver_id;

  perform public.log_audit_event('DRIVER_DELETED', 'driver', p_driver_id,
    'Livreur déplacé en corbeille : ' || existing.name, to_jsonb(existing), null);
end;
$$;
revoke all on function public.delete_driver(uuid) from public;
grant execute on function public.delete_driver(uuid) to authenticated;

create or replace function public.delete_conversation(p_conversation_id uuid)
returns public.conversations
language plpgsql security definer set search_path = public
as $$
declare
  updated public.conversations;
begin
  if not public.has_permission('settings.manage') then
    raise exception using errcode = '42501', message = 'Permission refusée : suppression réservée à l''administrateur';
  end if;

  update public.conversations set deleted_at = now() where id = p_conversation_id and deleted_at is null returning * into updated;
  if not found then
    raise exception using errcode = '22023', message = 'Conversation introuvable ou déjà supprimée';
  end if;

  perform public.log_audit_event('CONVERSATION_DELETED', 'conversation', p_conversation_id, 'Conversation déplacée en corbeille', null, null);
  return updated;
end;
$$;
revoke all on function public.delete_conversation(uuid) from public;
grant execute on function public.delete_conversation(uuid) to authenticated;
