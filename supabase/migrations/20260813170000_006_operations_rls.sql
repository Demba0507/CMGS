/* Operational RLS. Public checkout remains available only through the security-definer RPC. */

drop policy if exists "anon_select_customers" on public.customers;
drop policy if exists "anon_insert_customers" on public.customers;
drop policy if exists "anon_update_customers" on public.customers;
drop policy if exists "anon_delete_customers" on public.customers;
create policy "customers_select_authorized" on public.customers for select to authenticated using (public.has_permission('customers.view'));
create policy "customers_insert_authorized" on public.customers for insert to authenticated with check (public.has_permission('customers.edit'));
create policy "customers_update_authorized" on public.customers for update to authenticated using (public.has_permission('customers.edit')) with check (public.has_permission('customers.edit'));
create policy "customers_delete_admin" on public.customers for delete to authenticated using (public.has_permission('settings.manage'));

drop policy if exists "anon_select_orders" on public.orders;
drop policy if exists "anon_insert_orders" on public.orders;
drop policy if exists "anon_update_orders" on public.orders;
drop policy if exists "anon_delete_orders" on public.orders;
create policy "orders_select_authorized" on public.orders for select to authenticated using (public.has_permission('orders.view'));
create policy "orders_insert_authorized" on public.orders for insert to authenticated with check (public.has_permission('orders.create'));
create policy "orders_update_authorized" on public.orders for update to authenticated using (public.has_permission('orders.edit')) with check (public.has_permission('orders.edit'));
create policy "orders_delete_admin" on public.orders for delete to authenticated using (public.has_permission('settings.manage'));

drop policy if exists "anon_select_orderitems" on public.order_items;
drop policy if exists "anon_insert_orderitems" on public.order_items;
drop policy if exists "anon_update_orderitems" on public.order_items;
drop policy if exists "anon_delete_orderitems" on public.order_items;
create policy "orderitems_select_authorized" on public.order_items for select to authenticated using (public.has_permission('orders.view'));
create policy "orderitems_insert_authorized" on public.order_items for insert to authenticated with check (public.has_permission('orders.create'));
create policy "orderitems_update_authorized" on public.order_items for update to authenticated using (public.has_permission('orders.edit')) with check (public.has_permission('orders.edit'));
create policy "orderitems_delete_admin" on public.order_items for delete to authenticated using (public.has_permission('settings.manage'));

drop policy if exists "anon_select_payments" on public.payments;
drop policy if exists "anon_insert_payments" on public.payments;
drop policy if exists "anon_update_payments" on public.payments;
drop policy if exists "anon_delete_payments" on public.payments;
create policy "payments_select_authorized" on public.payments for select to authenticated using (public.has_permission('payments.view'));
create policy "payments_insert_authorized" on public.payments for insert to authenticated with check (public.has_permission('payments.view'));
create policy "payments_update_authorized" on public.payments for update to authenticated using (public.has_permission('payments.validate') or public.has_permission('payments.refund')) with check (public.has_permission('payments.validate') or public.has_permission('payments.refund'));
create policy "payments_delete_admin" on public.payments for delete to authenticated using (public.has_permission('settings.manage'));

drop policy if exists "anon_select_deliveries" on public.deliveries;
drop policy if exists "anon_insert_deliveries" on public.deliveries;
drop policy if exists "anon_update_deliveries" on public.deliveries;
drop policy if exists "anon_delete_deliveries" on public.deliveries;
create policy "deliveries_select_authorized" on public.deliveries for select to authenticated using (public.has_permission('deliveries.view'));
create policy "deliveries_insert_authorized" on public.deliveries for insert to authenticated with check (public.has_permission('deliveries.assign'));
create policy "deliveries_update_authorized" on public.deliveries for update to authenticated using (public.has_permission('deliveries.update') or public.has_permission('deliveries.assign')) with check (public.has_permission('deliveries.update') or public.has_permission('deliveries.assign'));
create policy "deliveries_delete_admin" on public.deliveries for delete to authenticated using (public.has_permission('settings.manage'));

drop policy if exists "anon_select_conv" on public.conversations;
drop policy if exists "anon_insert_conv" on public.conversations;
drop policy if exists "anon_update_conv" on public.conversations;
drop policy if exists "anon_delete_conv" on public.conversations;
create policy "conversations_select_authorized" on public.conversations for select to authenticated using (public.has_permission('chat.view'));
create policy "conversations_insert_authorized" on public.conversations for insert to authenticated with check (public.has_permission('chat.respond'));
create policy "conversations_update_authorized" on public.conversations for update to authenticated using (public.has_permission('chat.assign') or public.has_permission('chat.respond')) with check (public.has_permission('chat.assign') or public.has_permission('chat.respond'));
create policy "conversations_delete_admin" on public.conversations for delete to authenticated using (public.has_permission('settings.manage'));

drop policy if exists "anon_select_msg" on public.messages;
drop policy if exists "anon_insert_msg" on public.messages;
drop policy if exists "anon_update_msg" on public.messages;
drop policy if exists "anon_delete_msg" on public.messages;
create policy "messages_select_authorized" on public.messages for select to authenticated using (public.has_permission('chat.view'));
create policy "messages_insert_authorized" on public.messages for insert to authenticated with check (public.has_permission('chat.respond'));
create policy "messages_update_authorized" on public.messages for update to authenticated using (public.has_permission('chat.respond')) with check (public.has_permission('chat.respond'));
create policy "messages_delete_admin" on public.messages for delete to authenticated using (public.has_permission('settings.manage'));

drop policy if exists "anon_select_notif" on public.notifications;
drop policy if exists "anon_insert_notif" on public.notifications;
drop policy if exists "anon_update_notif" on public.notifications;
drop policy if exists "anon_delete_notif" on public.notifications;
create policy "notifications_select_authorized" on public.notifications for select to authenticated using (public.has_permission('orders.view') or public.has_permission('chat.view') or public.has_permission('deliveries.view'));
create policy "notifications_insert_authorized" on public.notifications for insert to authenticated with check (public.has_permission('orders.edit') or public.has_permission('chat.respond') or public.has_permission('deliveries.update'));
create policy "notifications_update_authorized" on public.notifications for update to authenticated using (public.has_permission('orders.edit') or public.has_permission('chat.respond') or public.has_permission('deliveries.update')) with check (public.has_permission('orders.edit') or public.has_permission('chat.respond') or public.has_permission('deliveries.update'));
create policy "notifications_delete_admin" on public.notifications for delete to authenticated using (public.has_permission('settings.manage'));

drop policy if exists "anon_select_logs" on public.event_logs;
drop policy if exists "anon_insert_logs" on public.event_logs;
drop policy if exists "anon_update_logs" on public.event_logs;
drop policy if exists "anon_delete_logs" on public.event_logs;
create policy "logs_select_authorized" on public.event_logs for select to authenticated using (public.has_permission('audit.view'));
create policy "logs_insert_authorized" on public.event_logs for insert to authenticated with check (public.has_permission('audit.view'));
create policy "logs_delete_admin" on public.event_logs for delete to authenticated using (public.has_permission('settings.manage'));

revoke all on public.customers, public.orders, public.order_items, public.payments, public.deliveries, public.conversations, public.messages, public.notifications, public.event_logs from anon;
grant select, insert, update, delete on public.customers, public.orders, public.order_items, public.payments, public.deliveries, public.conversations, public.messages, public.notifications, public.event_logs to authenticated;

