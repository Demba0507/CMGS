import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { ProductImage } from '@/lib/types';

export async function listProductImages(productId: string): Promise<ProductImage[]> {
  const { data, error } = await supabase.from('product_images').select('*').eq('product_id', productId).order('position');
  if (error) throw new Error(friendlyError(error, 'Impossible de charger les images de ce produit.'));
  return (data as ProductImage[]) ?? [];
}

export async function addProductImage(productId: string, imageUrl: string, color: string | null, nextPosition: number, makePrimary: boolean): Promise<ProductImage> {
  const { data, error } = await supabase.from('product_images').insert({
    product_id: productId, image_url: imageUrl, color, position: nextPosition, is_primary: makePrimary,
  }).select('*').single();
  if (error) throw new Error(friendlyError(error, "Impossible d'ajouter cette image."));
  return data as ProductImage;
}

export async function setPrimaryProductImage(id: string, imageUrl: string): Promise<void> {
  const { error } = await supabase.from('product_images').update({ is_primary: true, image_url: imageUrl }).eq('id', id);
  if (error) throw new Error(friendlyError(error, 'Impossible de définir cette image comme principale.'));
}

export async function setProductImageColor(id: string, color: string | null): Promise<void> {
  const { error } = await supabase.from('product_images').update({ color }).eq('id', id);
  if (error) throw new Error(friendlyError(error, "Impossible d'associer cette couleur."));
}

export async function reorderProductImages(updates: { id: string; position: number }[]): Promise<void> {
  for (const u of updates) {
    const { error } = await supabase.from('product_images').update({ position: u.position }).eq('id', u.id);
    if (error) throw new Error(friendlyError(error, 'Impossible de réorganiser les images.'));
  }
}

export async function deleteProductImage(id: string): Promise<void> {
  const { error } = await supabase.from('product_images').delete().eq('id', id);
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer cette image.'));
}
