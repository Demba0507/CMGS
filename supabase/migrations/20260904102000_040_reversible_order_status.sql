/*
  Étape 22 du prompt d'amélioration — Statuts de commande réversibles (§26).

  Jusqu'ici ORDER_STATUS_FLOW (frontend) n'autorisait que des transitions
  vers l'avant (PENDING→CONFIRMED→DELIVERED→RETURNED), sans aucun moyen de
  revenir en arrière en cas d'erreur — et rien ne l'empêchait ni ne
  l'autorisait réellement côté base, puisque le statut n'était jamais
  passé par une RPC dédiée (juste un .update() direct gated par
  orders.edit).

  Nouvelle RPC update_order_status : autorise toute transition entre les
  5 statuts (§26 : "ne pas imposer artificiellement un workflow
  irréversible"), MAIS reste prudente sur l'impact stock :
  - Passer À 'CANCELLED' continue de passer par cancel_order() (déjà
    correcte : restaure le stock, exige orders.cancel) — cette RPC refuse
    volontairement ce cas précis et renvoie vers cancel_order pour ne pas
    dupliquer/contourner cette logique.
  - Revenir DEPUIS 'CANCELLED' vers un autre statut (annuler l'annulation
    par erreur — exactement l'exemple du §26) est le vrai cas nouveau :
    le stock avait été restauré à l'annulation, donc corriger l'erreur
    doit re-décrémenter le stock de chaque article (en respectant la
    variante choisie, comme à l'étape 17). Si le stock a entre-temps été
    vendu à quelqu'un d'autre, la correction est refusée avec un message
    clair plutôt que de pousser le stock en négatif.
  - Toutes les autres transitions (PENDING↔CONFIRMED, CONFIRMED↔DELIVERED,
    DELIVERED→RETURNED, etc.) n'ont pas d'effet sur le stock et sont
    simplement autorisées, sous réserve de la permission orders.edit.

  Reste sécurisé et respecte les permissions comme demandé en fin de §26 :
  aucun contournement de RLS, toute la logique vit dans une RPC
  security definer classique comme le reste du projet.
*/

create or replace function public.update_order_status(p_order_id uuid, p_new_status text)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  item public.order_items%rowtype;
  updated public.orders;
  old_status text;
  current_stock integer;
begin
  if p_new_status not in ('PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED', 'RETURNED') then
    raise exception using errcode = '22023', message = 'Statut invalide.';
  end if;

  select * into order_row from public.orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'Commande introuvable.';
  end if;
  old_status := order_row.status;

  if old_status = p_new_status then
    return order_row;
  end if;

  if p_new_status = 'CANCELLED' then
    raise exception using errcode = '22023', message = 'Utilisez l''action "Annuler" pour ce changement (elle restaure aussi le stock correctement).';
  end if;

  if old_status = 'CANCELLED' then
    -- Correction d'une annulation faite par erreur (§26, exemple explicite) :
    -- même permission que pour annuler, puisqu'on défait la même action.
    if not public.has_permission('orders.cancel') then
      raise exception using errcode = '42501', message = 'Permission refusée : vous ne pouvez pas annuler une annulation.';
    end if;
    for item in select * from public.order_items where order_id = p_order_id loop
      if item.variant_id is not null then
        select stock into current_stock from public.product_variants where id = item.variant_id for update;
        if current_stock is null or current_stock < item.quantity then
          raise exception using errcode = 'P0001', message = 'Impossible d''annuler cette annulation : le stock de "' || coalesce(item.product_name, 'un article') || '" a changé depuis et n''est plus suffisant.';
        end if;
        update public.product_variants set stock = stock - item.quantity, updated_at = now() where id = item.variant_id;
      elsif item.product_id is not null then
        select stock into current_stock from public.products where id = item.product_id for update;
        if current_stock is null or current_stock < item.quantity then
          raise exception using errcode = 'P0001', message = 'Impossible d''annuler cette annulation : le stock de "' || coalesce(item.product_name, 'un article') || '" a changé depuis et n''est plus suffisant.';
        end if;
        update public.products set stock = stock - item.quantity, updated_at = now() where id = item.product_id;
        insert into public.stock_movements (product_id, type, quantity, previous_stock, new_stock, note)
        values (item.product_id, 'RESERVATION', item.quantity, current_stock, current_stock - item.quantity, 'Annulation de l''annulation, commande ' || order_row.code);
      end if;
    end loop;
  else
    if not public.has_permission('orders.edit') then
      raise exception using errcode = '42501', message = 'Permission refusée.';
    end if;
  end if;

  update public.orders
  set status = p_new_status, updated_at = now()
  where id = p_order_id
  returning * into updated;

  -- La livraison physique EST la confirmation du paiement en espèces à la
  -- livraison : ce n'est pas une "validation" au sens du §29 (qui concerne
  -- Orange Money manuel, une vérification humaine déliberée d'un transfert),
  -- donc géré ici automatiquement, sans dépendre de la permission
  -- payments.validate de la personne qui marque juste la commande comme
  -- livrée (sinon échec silencieux si elle n'a que orders.edit).
  if p_new_status = 'DELIVERED' then
    update public.payments set status = 'VERIFIED', verified_at = now()
    where order_id = p_order_id and status = 'PENDING' and method = 'CASH_ON_DELIVERY';
  end if;

  perform public.log_audit_event('ORDER_STATUS_CORRECTED', 'order', p_order_id,
    'Commande ' || order_row.code || ' : ' || old_status || ' → ' || p_new_status, to_jsonb(old_status), to_jsonb(p_new_status));

  return updated;
end;
$$;
revoke all on function public.update_order_status(uuid, text) from public;
grant execute on function public.update_order_status(uuid, text) to authenticated;
