import { supabase } from '@/lib/supabase';

export interface CheckoutItemInput {
  product_id: string;
  quantity: number;
}

export interface CheckoutResult {
  order_id: string;
  order_code: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
}

export async function createPublicCheckout(input: {
  name: string;
  phone: string;
  neighborhood: string;
  address?: string;
  items: CheckoutItemInput[];
  paymentMethod: 'CASH_ON_DELIVERY' | 'ORANGE_MONEY_MANUAL';
}): Promise<CheckoutResult> {
  const { data, error } = await supabase.rpc('create_public_checkout', {
    p_name: input.name,
    p_phone: input.phone,
    p_neighborhood: input.neighborhood,
    p_address: input.address ?? '',
    p_items: input.items,
    p_payment_method: input.paymentMethod,
  });
  if (error || !data?.[0]) throw new Error('Impossible de créer la commande. Vérifiez le stock et réessayez.');
  return data[0] as CheckoutResult;
}
