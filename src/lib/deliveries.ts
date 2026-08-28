import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { Delivery, DeliveryProof, DeliveryFailure, Payment } from '@/lib/types';

export async function assignDelivery(orderId: string, driverId: string): Promise<Delivery> {
  const { data, error } = await supabase.rpc('assign_delivery', { p_order_id: orderId, p_driver_id: driverId });
  if (error) throw new Error(friendlyError(error, "Impossible d'assigner cette livraison."));
  return data as Delivery;
}

export async function updateDeliveryStatus(deliveryId: string, status: string): Promise<Delivery> {
  const { data, error } = await supabase.rpc('update_delivery_status', { p_delivery_id: deliveryId, p_status: status });
  if (error) throw new Error(friendlyError(error, 'Impossible de modifier le statut.'));
  return data as Delivery;
}

export async function recordDeliveryProof(deliveryId: string, method: DeliveryProof['method'], data?: string): Promise<DeliveryProof> {
  const { data: result, error } = await supabase.rpc('record_delivery_proof', { p_delivery_id: deliveryId, p_method: method, p_data: data ?? null });
  if (error) throw new Error(friendlyError(error, "Impossible d'enregistrer la preuve."));
  return result as DeliveryProof;
}

export async function reportDeliveryFailure(deliveryId: string, reason: string, comment?: string): Promise<DeliveryFailure> {
  const { data, error } = await supabase.rpc('report_delivery_failure', { p_delivery_id: deliveryId, p_reason: reason, p_comment: comment ?? null });
  if (error) throw new Error(friendlyError(error, "Impossible de signaler l'échec."));
  return data as DeliveryFailure;
}

export async function resolveDeliveryFailure(failureId: string, decision: 'RETRY' | 'RETURN' | 'CANCEL_ORDER'): Promise<DeliveryFailure> {
  const { data, error } = await supabase.rpc('resolve_delivery_failure', { p_failure_id: failureId, p_decision: decision });
  if (error) throw new Error(friendlyError(error, 'Impossible de trancher cet échec.'));
  return data as DeliveryFailure;
}

export async function driverConfirmCashPayment(deliveryId: string): Promise<Payment> {
  const { data, error } = await supabase.rpc('driver_confirm_cash_payment', { p_delivery_id: deliveryId });
  if (error) throw new Error(friendlyError(error, 'Impossible de confirmer ce paiement.'));
  return data as Payment;
}

export async function listDeliveryFailures(): Promise<DeliveryFailure[]> {
  const { data, error } = await supabase.from('delivery_failures').select('*').order('reported_at', { ascending: false });
  if (error) throw new Error('Impossible de charger les échecs de livraison.');
  return (data as DeliveryFailure[]) ?? [];
}
