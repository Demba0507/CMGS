import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { Order } from '@/lib/types';

export async function cancelOrder(orderId: string, reason?: string): Promise<Order> {
  const { data, error } = await supabase.rpc('cancel_order', { p_order_id: orderId, p_reason: reason ?? null });
  if (error) throw new Error(friendlyError(error, "Impossible d'annuler cette commande."));
  return data as Order;
}

/**
 * Tout changement de statut réversible sauf vers 'CANCELLED' (qui passe par
 * cancelOrder — restaure le stock et exige une raison). Bloque proprement
 * avec un message clair si une réactivation depuis 'CANCELLED' n'a plus
 * assez de stock, plutôt que de survendre (§26).
 */
export async function updateOrderStatus(orderId: string, newStatus: string): Promise<Order> {
  const { data, error } = await supabase.rpc('update_order_status', { p_order_id: orderId, p_new_status: newStatus });
  if (error) throw new Error(friendlyError(error, 'Impossible de modifier le statut de cette commande.'));
  return data as Order;
}

/** Déplace une commande en corbeille (réversible). Libère le stock si elle n'était pas déjà annulée/retournée. */
export async function deleteOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_order', { p_order_id: orderId });
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer cette commande.'));
}

export async function restoreOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_order', { p_order_id: orderId });
  if (error) throw new Error(friendlyError(error, 'Impossible de restaurer cette commande.'));
}

export async function purgeOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('purge_order', { p_order_id: orderId });
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer définitivement cette commande.'));
}
