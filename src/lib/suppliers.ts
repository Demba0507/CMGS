import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { ProductSupplier } from '@/lib/types';

/** Fournisseurs liés à un produit, avec leurs prix — comparaison indépendante du stock. */
export async function listProductSuppliers(productId: string): Promise<ProductSupplier[]> {
  const { data, error } = await supabase.from('product_suppliers').select('*').eq('product_id', productId).order('is_primary', { ascending: false });
  if (error) throw new Error('Impossible de charger les fournisseurs de ce produit.');
  return (data as ProductSupplier[]) ?? [];
}

export async function addProductSupplier(productId: string, supplierId: string, initialSupplierPrice: number, purchasePrice: number, makePrimary: boolean): Promise<ProductSupplier> {
  const { data, error } = await supabase.rpc('add_product_supplier', {
    p_product_id: productId, p_supplier_id: supplierId,
    p_initial_supplier_price: initialSupplierPrice, p_purchase_price: purchasePrice, p_make_primary: makePrimary,
  });
  if (error) throw new Error(friendlyError(error, "Impossible d'associer ce fournisseur."));
  return data as ProductSupplier;
}

export async function setPrimarySupplier(productId: string, supplierId: string): Promise<void> {
  const { error } = await supabase.rpc('set_primary_supplier', { p_product_id: productId, p_supplier_id: supplierId });
  if (error) throw new Error(friendlyError(error, 'Impossible de définir ce fournisseur comme prioritaire.'));
}

export async function removeProductSupplier(productSupplierId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_product_supplier', { p_product_supplier_id: productSupplierId });
  if (error) throw new Error(friendlyError(error, 'Impossible de retirer ce fournisseur.'));
}

/** Supprime un fournisseur (déplacement en corbeille — voir migration 023). */
export async function deleteSupplier(supplierId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_supplier', { p_supplier_id: supplierId });
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer ce fournisseur.'));
}

/** Sort un fournisseur de la corbeille. */
export async function restoreSupplier(supplierId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_supplier', { p_supplier_id: supplierId });
  if (error) throw new Error(friendlyError(error, 'Impossible de restaurer ce fournisseur.'));
}

/** Suppression définitive et irréversible d'un fournisseur déjà en corbeille. */
export async function purgeSupplier(supplierId: string): Promise<void> {
  const { error } = await supabase.rpc('purge_supplier', { p_supplier_id: supplierId });
  if (error) throw new Error(friendlyError(error, 'Impossible de supprimer définitivement ce fournisseur.'));
}
