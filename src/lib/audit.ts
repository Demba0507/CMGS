import { supabase } from '@/lib/supabase';

/**
 * Journalise une action employé avec, si pertinent, l'ancienne et la nouvelle valeur.
 * N'échoue jamais bruyamment : une erreur de journalisation ne doit pas bloquer l'action métier
 * qui vient d'être effectuée avec succès (l'action réelle a déjà été validée côté serveur).
 */
export async function logAuditEvent(
  eventType: string,
  entityType: string,
  entityId: string | null,
  description: string,
  oldValue?: unknown,
  newValue?: unknown
): Promise<void> {
  const { error } = await supabase.rpc('log_audit_event', {
    p_event_type: eventType,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_description: description,
    p_old_value: oldValue ?? null,
    p_new_value: newValue ?? null,
  });
  if (error) console.error('Journalisation impossible :', error.message);
}
