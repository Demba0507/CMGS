import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { OrderSupplierGroup } from '@/lib/types';

export async function updateSuborderStatus(suborderId: string, status: string): Promise<OrderSupplierGroup> {
  const { data, error } = await supabase.rpc('update_suborder_status', { p_suborder_id: suborderId, p_status: status });
  if (error) throw new Error(friendlyError(error, 'Impossible de modifier la sous-commande.'));
  return data as OrderSupplierGroup;
}
