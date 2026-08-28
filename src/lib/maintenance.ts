import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { Backup, Conversation } from '@/lib/types';

export async function createBackupSnapshot(reason: string): Promise<Backup> {
  const { data, error } = await supabase.rpc('create_backup_snapshot', { p_reason: reason });
  if (error) throw new Error(friendlyError(error, 'Impossible de créer la sauvegarde.'));
  return data as Backup;
}

export async function listBackups(): Promise<Backup[]> {
  const { data, error } = await supabase.from('backups').select('id, reason, tables_included, row_counts, created_by, created_at').order('created_at', { ascending: false });
  if (error) throw new Error('Impossible de charger les sauvegardes.');
  return (data as Backup[]) ?? [];
}

export async function restoreBackup(backupId: string): Promise<{ restored: string[]; skipped: string[] }> {
  const { data, error } = await supabase.rpc('restore_backup', { p_backup_id: backupId });
  if (error) throw new Error(friendlyError(error, 'Restauration impossible.'));
  return data as { restored: string[]; skipped: string[] };
}

export async function deleteBackup(backupId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_backup', { p_backup_id: backupId });
  if (error) throw new Error(friendlyError(error, 'Suppression impossible.'));
}

export async function getBackupSnapshot(backupId: string): Promise<unknown> {
  const { data, error } = await supabase.from('backups').select('snapshot').eq('id', backupId).single();
  if (error) throw new Error('Impossible de récupérer le contenu de cette sauvegarde.');
  return data.snapshot;
}

export async function hasRecentBackup(): Promise<boolean> {
  const backups = await listBackups();
  if (backups.length === 0) return false;
  return Date.now() - new Date(backups[0].created_at).getTime() < 60 * 60 * 1000;
}

export async function deleteConversation(conversationId: string): Promise<Conversation> {
  const { data, error } = await supabase.rpc('delete_conversation', { p_conversation_id: conversationId });
  if (error) throw new Error(friendlyError(error, 'Suppression impossible.'));
  return data as Conversation;
}

export async function restoreConversation(conversationId: string): Promise<Conversation> {
  const { data, error } = await supabase.rpc('restore_conversation', { p_conversation_id: conversationId });
  if (error) throw new Error(friendlyError(error, 'Restauration impossible.'));
  return data as Conversation;
}

/** Suppression définitive et irréversible d'une conversation déjà en corbeille. */
export async function purgeConversation(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('purge_conversation', { p_conversation_id: conversationId });
  if (error) throw new Error(friendlyError(error, 'Suppression définitive impossible.'));
}

export async function archiveConversation(conversationId: string, archived: boolean): Promise<Conversation> {
  const { data, error } = await supabase.rpc('archive_conversation', { p_conversation_id: conversationId, p_archived: archived });
  if (error) throw new Error(friendlyError(error, 'Action impossible.'));
  return data as Conversation;
}

/** Ré-authentifie l'utilisateur courant avec son mot de passe (confirmation d'action critique, §55). */
export async function confirmPassword(password: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData.session?.user.email;
  if (!email) throw new Error('Session introuvable.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Mot de passe incorrect.');
}
