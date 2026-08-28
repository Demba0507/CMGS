import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';

/**
 * Supprime un client (déplacement en corbeille — voir migration 023). La
 * vérification de permission et l'exigence d'une sauvegarde récente sont
 * appliquées côté serveur par la RPC `delete_customer` : la suppression
 * directe via l'API REST est révoquée, ce point d'entrée est donc le seul
 * chemin possible, quel que soit l'état de l'interface.
 */
export async function deleteCustomer(customerId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_customer', { p_customer_id: customerId });
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer ce client.'));
}

/** Sort un client de la corbeille. */
export async function restoreCustomer(customerId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_customer', { p_customer_id: customerId });
  if (error) throw new Error(friendlyError(error, 'Impossible de restaurer ce client.'));
}

/** Suppression définitive et irréversible d'un client déjà en corbeille. */
export async function purgeCustomer(customerId: string): Promise<void> {
  const { error } = await supabase.rpc('purge_customer', { p_customer_id: customerId });
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer définitivement ce client.'));
}
