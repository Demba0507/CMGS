/**
 * Validation des images produits côté interface (§11 du prompt maître).
 * Complète — sans la remplacer — la contrainte appliquée côté serveur sur le
 * bucket 'product-images' (migration 050_product_image_upload_limits.sql) :
 * ceci donne un message clair immédiatement, avant même de tenter l'upload.
 */

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo

export function validateProductImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Format non autorisé — utilisez une image JPG, PNG ou WebP.';
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return 'Image trop volumineuse — 5 Mo maximum.';
  }
  return null;
}
