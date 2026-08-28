import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { Complaint, ComplaintMessage } from '@/lib/types';

export async function listComplaints(): Promise<Complaint[]> {
  const { data, error } = await supabase.from('complaints').select('*').order('updated_at', { ascending: false });
  if (error) throw new Error('Impossible de charger les réclamations.');
  return (data as Complaint[]) ?? [];
}

export async function listComplaintMessages(complaintId: string): Promise<ComplaintMessage[]> {
  const { data, error } = await supabase.from('complaint_messages').select('*').eq('complaint_id', complaintId).order('created_at', { ascending: true });
  if (error) throw new Error('Impossible de charger les messages.');
  return (data as ComplaintMessage[]) ?? [];
}

export async function createComplaint(customerId: string, orderId: string | null, subject: string, message: string, channel = 'SITE'): Promise<Complaint> {
  const { data, error } = await supabase.rpc('create_complaint', {
    p_customer_id: customerId, p_order_id: orderId, p_subject: subject, p_message: message, p_channel: channel,
  });
  if (error) throw new Error(friendlyError(error, 'Impossible de créer la réclamation.'));
  return data as Complaint;
}

export async function addComplaintMessage(complaintId: string, content: string): Promise<ComplaintMessage> {
  const { data, error } = await supabase.rpc('add_complaint_message', { p_complaint_id: complaintId, p_content: content });
  if (error) throw new Error(friendlyError(error, "Impossible d'envoyer le message."));
  return data as ComplaintMessage;
}

export async function updateComplaint(complaintId: string, status?: string, assignedTo?: string, resolution?: string): Promise<Complaint> {
  const { data, error } = await supabase.rpc('update_complaint', {
    p_complaint_id: complaintId, p_status: status ?? null, p_assigned_to: assignedTo ?? null, p_resolution: resolution ?? null,
  });
  if (error) throw new Error(friendlyError(error, 'Impossible de mettre à jour la réclamation.'));
  return data as Complaint;
}
