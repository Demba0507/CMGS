/* Phase 10 — Canaux additionnels (cahier des charges §39-40).
   Le widget web garde son conversationId en mémoire navigateur d'un message à l'autre, mais un
   webhook WhatsApp/Instagram/Facebook est appelé sans état entre deux messages : il faut donc
   retrouver la conversation via l'identifiant externe (numéro de téléphone, id de compte social)
   plutôt que d'en créer une nouvelle à chaque message.
   Un seul point d'entrée pour tous les canaux, afin de ne jamais dupliquer la logique commerciale
   (§40 : « ne pas créer une logique commerciale complètement différente »). Additive uniquement. */

alter table public.customers add column if not exists external_channel_ref text;
create index if not exists idx_customers_external_ref on public.customers(channel, external_channel_ref) where external_channel_ref is not null;

insert into public.settings (key, value, category, description, is_public) values
  ('channels.whatsapp_enabled', 'false', 'chatbot', 'Canal WhatsApp activé', true),
  ('channels.whatsapp_webhook_verify_token', '""', 'chatbot', 'Jeton de vérification du webhook WhatsApp (Meta)', false),
  ('channels.instagram_enabled', 'false', 'chatbot', 'Canal Instagram activé (préparation uniquement)', true),
  ('channels.facebook_enabled', 'false', 'chatbot', 'Canal Facebook Messenger activé (préparation uniquement)', true)
on conflict (key) do nothing;

-- ============ append_public_message : ACCEPTER LES CANAUX EXTERNES ============
-- La fonction d'origine (migration 007) ne reconnaissait que SITE/SIMULATOR : un message entrant
-- WhatsApp/Instagram/Facebook aurait été systématiquement rejeté ("Message invalide").
create or replace function public.append_public_message(p_conversation_id uuid, p_sender text, p_content text, p_intent text default null, p_product_id uuid default null)
returns public.messages
language plpgsql security definer set search_path = public
as $$
declare
  conversation_row public.conversations%rowtype;
  created_message public.messages;
begin
  select * into conversation_row from public.conversations
  where id = p_conversation_id and channel in ('SITE', 'SIMULATOR', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK');
  if not found or p_sender not in ('CUSTOMER', 'BOT', 'SYSTEM') or nullif(trim(p_content), '') is null then
    raise exception using errcode = '22023', message = 'Message invalide';
  end if;
  insert into public.messages (conversation_id, sender, content, intent, product_id)
  values (p_conversation_id, p_sender, trim(p_content), p_intent, p_product_id)
  returning * into created_message;
  update public.conversations set updated_at = now() where id = p_conversation_id;
  return created_message;
end;
$$;
revoke all on function public.append_public_message(uuid, text, text, text, uuid) from public;
grant execute on function public.append_public_message(uuid, text, text, text, uuid) to anon, authenticated;

-- ============ RPC : RETROUVER OU CRÉER UNE CONVERSATION POUR UN CANAL EXTERNE ============
create or replace function public.get_or_create_channel_conversation(
  p_channel text, p_external_ref text, p_display_name text default null
)
returns table (conversation_id uuid, customer_id uuid, is_new_conversation boolean)
language plpgsql security definer set search_path = public
as $$
declare
  resolved_customer_id uuid;
  resolved_conversation_id uuid;
  created_new boolean := false;
  normalized_ref text;
begin
  if p_channel not in ('WHATSAPP', 'INSTAGRAM', 'FACEBOOK') then
    raise exception using errcode = '22023', message = 'Canal invalide pour cette fonction';
  end if;
  normalized_ref := nullif(trim(p_external_ref), '');
  if normalized_ref is null then
    raise exception using errcode = '22023', message = 'Identifiant externe manquant';
  end if;

  select id into resolved_customer_id from public.customers
  where channel = p_channel and external_channel_ref = normalized_ref
  order by created_at desc limit 1;

  if resolved_customer_id is null and p_channel = 'WHATSAPP' then
    -- Un client déjà connu par téléphone sur un autre canal (ex: site web) doit être reconnu,
    -- pour ne pas fragmenter son historique.
    select id into resolved_customer_id from public.customers where phone = normalized_ref order by created_at desc limit 1;
  end if;

  if resolved_customer_id is null then
    insert into public.customers (name, phone, channel, status, external_channel_ref, last_interaction)
    values (
      coalesce(nullif(trim(p_display_name), ''), 'Client ' || initcap(lower(p_channel))),
      case when p_channel = 'WHATSAPP' then normalized_ref else null end,
      p_channel, 'PROSPECT', normalized_ref, now()
    )
    returning id into resolved_customer_id;
  else
    update public.customers set
      external_channel_ref = coalesce(external_channel_ref, normalized_ref),
      last_interaction = now()
    where id = resolved_customer_id;
  end if;

  select id into resolved_conversation_id from public.conversations c
  where c.customer_id = resolved_customer_id and c.channel = p_channel and c.status <> 'CLOSED'
  order by c.updated_at desc limit 1;

  if resolved_conversation_id is null then
    insert into public.conversations (customer_id, channel, status)
    values (resolved_customer_id, p_channel, 'ACTIVE')
    returning id into resolved_conversation_id;
    created_new := true;
  end if;

  return query select resolved_conversation_id, resolved_customer_id, created_new;
end;
$$;
revoke all on function public.get_or_create_channel_conversation(text, text, text) from public;
grant execute on function public.get_or_create_channel_conversation(text, text, text) to anon, authenticated;
