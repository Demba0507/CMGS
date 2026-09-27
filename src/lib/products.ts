import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';

/** Déplace un produit en corbeille (réversible — voir migration 038). */
export async function deleteProduct(productId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_product', { p_product_id: productId });
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer ce produit.'));
}

/** Sort un produit de la corbeille. */
export async function restoreProduct(productId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_product', { p_product_id: productId });
  if (error) throw new Error(friendlyError(error, 'Impossible de restaurer ce produit.'));
}

/** Suppression définitive et irréversible d'un produit déjà en corbeille. */
export async function purgeProduct(productId: string): Promise<void> {
  const { error } = await supabase.rpc('purge_product', { p_product_id: productId });
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer définitivement ce produit.'));
}
