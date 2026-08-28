import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';

/** Supprime un livreur (déplacement en corbeille — voir migration 023). */
export async function deleteDriver(driverId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_driver', { p_driver_id: driverId });
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer ce livreur.'));
}

/** Sort un livreur de la corbeille. */
export async function restoreDriver(driverId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_driver', { p_driver_id: driverId });
  if (error) throw new Error(friendlyError(error, 'Impossible de restaurer ce livreur.'));
}

/** Suppression définitive et irréversible d'un livreur déjà en corbeille. */
export async function purgeDriver(driverId: string): Promise<void> {
  const { error } = await supabase.rpc('purge_driver', { p_driver_id: driverId });
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer définitivement ce livreur.'));
}
