import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { ProductVariant, PublicVariant } from '@/lib/types';

/** Projection publique (boutique) : jamais le stock exact, voir migration 035. */
export async function getPublicVariants(productId: string): Promise<PublicVariant[]> {
  const { data, error } = await supabase.rpc('get_public_variants', { p_product_id: productId });
  if (error) return [];
  return (data as PublicVariant[]) ?? [];
}

export async function listProductVariants(productId: string): Promise<ProductVariant[]> {
  const { data, error } = await supabase.from('product_variants').select('*').eq('product_id', productId).order('color').order('size');
  if (error) throw new Error(friendlyError(error, 'Impossible de charger les variantes de ce produit.'));
  return (data as ProductVariant[]) ?? [];
}

export async function createProductVariant(input: { product_id: string; color: string | null; size: string | null; stock: number; image_url: string | null }): Promise<ProductVariant> {
  const { data, error } = await supabase.from('product_variants').insert(input).select('*').single();
  if (error) throw new Error(friendlyError(error, "Impossible de créer cette variante — vérifiez qu'elle n'existe pas déjà."));
  return data as ProductVariant;
}

export async function updateProductVariant(id: string, input: { color: string | null; size: string | null; stock: number; image_url: string | null }): Promise<ProductVariant> {
  const { data, error } = await supabase.from('product_variants').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
  if (error) throw new Error(friendlyError(error, 'Impossible de modifier cette variante.'));
  return data as ProductVariant;
}

export async function deleteProductVariant(id: string): Promise<void> {
  const { error } = await supabase.from('product_variants').delete().eq('id', id);
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer cette variante.'));
}
