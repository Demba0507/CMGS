import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { Return } from '@/lib/types';

export const RETURN_REASON_LABELS: Record<Return['reason_category'], string> = {
  DEFECTIVE: 'Produit défectueux',
  WRONG_ITEM: 'Mauvais produit livré',
  CHANGED_MIND: "Changement d'avis",
  DELIVERY_REFUSED: 'Refus de livraison',
  OTHER: 'Autre motif',
};

export async function listReturns(): Promise<Return[]> {
  const { data, error } = await supabase.from('returns').select('*').order('created_at', { ascending: false });
  if (error) throw new Error('Impossible de charger les retours.');
  return (data as Return[]) ?? [];
}

export async function requestReturn(orderId: string, orderItemId: string, reasonCategory: Return['reason_category'], comment?: string): Promise<Return> {
  const { data, error } = await supabase.rpc('request_return', {
    p_order_id: orderId, p_order_item_id: orderItemId, p_reason_category: reasonCategory, p_comment: comment ?? null,
  });
  if (error) throw new Error(friendlyError(error, 'Impossible de demander ce retour.'));
  return data as Return;
}

export async function resolveReturn(returnId: string, status: 'APPROVED' | 'REJECTED' | 'COMPLETED', resolution?: string): Promise<Return> {
  const { data, error } = await supabase.rpc('resolve_return', { p_return_id: returnId, p_status: status, p_resolution: resolution ?? null });
  if (error) throw new Error(friendlyError(error, 'Impossible de mettre à jour ce retour.'));
  return data as Return;
}
