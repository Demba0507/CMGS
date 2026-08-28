import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { Order } from '@/lib/types';

export async function cancelOrder(orderId: string, reason?: string): Promise<Order> {
  const { data, error } = await supabase.rpc('cancel_order', { p_order_id: orderId, p_reason: reason ?? null });
  if (error) throw new Error(friendlyError(error, "Impossible d'annuler cette commande."));
  return data as Order;
}
