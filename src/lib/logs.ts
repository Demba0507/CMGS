import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';

export async function deleteAuditLogEntry(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_audit_log_entry', { p_id: id });
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer cette entrée.'));
}

/** Retourne le nombre d'entrées supprimées. */
export async function purgeAuditLogsBefore(before: string): Promise<number> {
  const { data, error } = await supabase.rpc('purge_audit_logs_before', { p_before: before });
  if (error) throw new Error(friendlyError(error, 'Impossible de purger le journal.'));
  return (data as number) ?? 0;
}
