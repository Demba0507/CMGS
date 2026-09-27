import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';

interface PublicProductRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category_id: string | null;
  sale_price: number;
  image_url: string | null;
  status: Product['status'];
  in_stock: boolean;
  max_orderable: number;
  created_at: string;
  updated_at: string;
}

function toCatalogProduct(product: PublicProductRow): Product {
  return {
    ...product,
    supplier_id: null,
    supplier_price: 0,
    // Quantité maximale commandable, plafonnée côté serveur (jamais le stock interne exact).
    stock: product.max_orderable,
    stock_last_checked: null,
  };
}

/** Reads only the customer-safe product projection exposed by the database. */
export async function getPublicProducts(): Promise<Product[]> {
  const { data, error } = await supabase.rpc('get_public_products');
  if (error) return [];
  return ((data as PublicProductRow[] | null) ?? []).map(toCatalogProduct);
}
