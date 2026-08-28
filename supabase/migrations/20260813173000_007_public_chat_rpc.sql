/* Public chat writes are constrained to a conversation created by this API. */
create or replace function public.create_public_conversation(p_channel text default 'SITE')
returns table (conversation_id uuid, customer_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  created_customer uuid;
  created_conversation uuid;
begin
  if p_channel not in ('SITE', 'SIMULATOR') then
    raise exception using errcode = '22023', message = 'Canal invalide';
  end if;
  insert into public.customers (name, channel, status) values ('Client anonyme', p_channel, 'PROSPECT') returning id into created_customer;
  insert into public.conversations (customer_id, channel, status) values (created_customer, p_channel, 'ACTIVE') returning id into created_conversation;
  return query select created_conversation, created_customer;
end;
$$;

create or replace function public.append_public_message(p_conversation_id uuid, p_sender text, p_content text, p_intent text default null, p_product_id uuid default null)
returns public.messages
language plpgsql security definer set search_path = public
as $$
declare
  conversation_row public.conversations%rowtype;
  created_message public.messages;
begin
  select * into conversation_row from public.conversations where id = p_conversation_id and channel in ('SITE', 'SIMULATOR');
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

revoke all on function public.create_public_conversation(text) from public;
revoke all on function public.append_public_message(uuid, text, text, text, uuid) from public;
grant execute on function public.create_public_conversation(text) to anon, authenticated;
grant execute on function public.append_public_message(uuid, text, text, text, uuid) to anon, authenticated;

