import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { Customer, Order, OrderItem, Payment, Delivery, Conversation, Message, Return } from '@/lib/types';

export async function getMyCustomerProfile(): Promise<Customer | null> {
  const { data, error } = await supabase.from('customers').select('*').maybeSingle();
  if (error) throw new Error('Impossible de charger votre profil.');
  return (data as Customer) ?? null;
}

export async function updateMyCustomerProfile(name: string, phone: string, neighborhood: string, address?: string): Promise<Customer> {
  const { data, error } = await supabase.rpc('update_my_customer_profile', {
    p_name: name, p_phone: phone, p_neighborhood: neighborhood, p_address: address ?? null,
  });
  if (error) throw new Error(friendlyError(error, 'Mise à jour impossible.'));
  return data as Customer;
}

export async function updateMyCustomerLocation(latitude: number, longitude: number): Promise<Customer> {
  const { data, error } = await supabase.rpc('update_my_customer_location', { p_latitude: latitude, p_longitude: longitude });
  if (error) throw new Error(friendlyError(error, 'Impossible de partager la position.'));
  return data as Customer;
}

export async function getMyNotifications(): Promise<import('@/lib/types').CustomerNotification[]> {
  const { data, error } = await supabase.from('customer_notifications').select('*').order('created_at', { ascending: false });
  if (error) throw new Error('Impossible de charger vos notifications.');
  return (data as import('@/lib/types').CustomerNotification[]) ?? [];
}

export async function markMyNotificationRead(id: string): Promise<void> {
  await supabase.from('customer_notifications').update({ read: true }).eq('id', id);
}

export interface MyHistory {
  orders: Order[];
  orderItemsByOrder: Record<string, OrderItem[]>;
  payments: Payment[];
  deliveries: Delivery[];
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
  returns: Return[];
}

/** Charge tout l'historique du client connecté. Les policies RLS *_select_own garantissent
 *  qu'aucune donnée d'un autre client ne peut être renvoyée, quelle que soit la requête. */
export async function getMyHistory(): Promise<MyHistory> {
  const [{ data: orders }, { data: payments }, { data: deliveries }, { data: conversations }, { data: returns }] = await Promise.all([
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('payments').select('*'),
    supabase.from('deliveries').select('*'),
    supabase.from('conversations').select('*').order('updated_at', { ascending: false }),
    supabase.from('returns').select('*'),
  ]);

  const orderList = (orders as Order[]) ?? [];
  const orderItemsByOrder: Record<string, OrderItem[]> = {};
  if (orderList.length > 0) {
    const { data: items } = await supabase.from('order_items').select('*').in('order_id', orderList.map((o) => o.id));
    for (const item of (items as OrderItem[]) ?? []) {
      (orderItemsByOrder[item.order_id] ??= []).push(item);
    }
  }

  const conversationList = (conversations as Conversation[]) ?? [];
  const messagesByConversation: Record<string, Message[]> = {};
  if (conversationList.length > 0) {
    const { data: messages } = await supabase.from('messages').select('*').in('conversation_id', conversationList.map((c) => c.id)).order('created_at', { ascending: true });
    for (const msg of (messages as Message[]) ?? []) {
      (messagesByConversation[msg.conversation_id] ??= []).push(msg);
    }
  }

  return {
    orders: orderList,
    orderItemsByOrder,
    payments: (payments as Payment[]) ?? [],
    deliveries: (deliveries as Delivery[]) ?? [],
    conversations: conversationList,
    messagesByConversation,
    returns: (returns as Return[]) ?? [],
  };
}
