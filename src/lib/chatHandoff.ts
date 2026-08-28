import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { Conversation, Message } from '@/lib/types';

export async function assignConversation(conversationId: string, employeeId?: string): Promise<Conversation> {
  const { data, error } = await supabase.rpc('assign_conversation', { p_conversation_id: conversationId, p_employee_id: employeeId ?? null });
  if (error) throw new Error(friendlyError(error, 'Impossible de prendre en charge cette conversation.'));
  return data as Conversation;
}

export async function sendEmployeeMessage(conversationId: string, content: string): Promise<Message> {
  const { data, error } = await supabase.rpc('send_employee_message', { p_conversation_id: conversationId, p_content: content });
  if (error) throw new Error(friendlyError(error, "Impossible d'envoyer le message."));
  return data as Message;
}

export async function closeConversation(conversationId: string): Promise<Conversation> {
  const { data, error } = await supabase.rpc('close_conversation', { p_conversation_id: conversationId });
  if (error) throw new Error(friendlyError(error, 'Impossible de clôturer cette conversation.'));
  return data as Conversation;
}
