import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Trash2, ImagePlus, AlertCircle, ArrowUp, ArrowDown, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { listProductImages, addProductImage, setPrimaryProductImage, setProductImageColor, reorderProductImages, deleteProductImage } from '@/lib/images';
import { validateProductImage, ALLOWED_IMAGE_TYPES } from '@/lib/imageValidation';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import type { Product, ProductImage } from '@/lib/types';

async function uploadGalleryImage(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filePath = `gallery/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('product-images').upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw new Error(friendlyError(error, "Échec de l'upload de l'image."));
  return supabase.storage.from('product-images').getPublicUrl(filePath).data.publicUrl;
}

export default function ImagesPanel({ product, onClose, onChanged }: { product: Product; onClose: () => void; onChanged: () => void }) {
  const { confirmAction } = useConfirm();
  const toast = useToast();
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setImages(await listProductImages(product.id));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => { await load(); onChanged(); };

  const handleUpload = async (file: File) => {
    const validationError = validateProductImage(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadGalleryImage(file);
      const nextPosition = images.length === 0 ? 0 : Math.max(...images.map((i) => i.position)) + 1;
      await addProductImage(product.id, url, null, nextPosition, images.length === 0);
      await refresh();
      toast.success('Image ajoutée.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'ajouter cette image.");
    } finally {
      setUploading(false);
    }
  };

  const makePrimary = async (img: ProductImage) => {
    if (busy) return;
    setBusy(true);
    try {
      await setPrimaryProductImage(img.id, img.image_url);
      await refresh();
      toast.success('Image principale mise à jour.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de définir cette image comme principale.');
    } finally {
      setBusy(false);
    }
  };

  const setColor = async (img: ProductImage, color: string) => {
    try {
      await setProductImageColor(img.id, color.trim() || null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'associer cette couleur.");
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (busy) return;
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const a = images[index];
    const b = images[target];
    setBusy(true);
    try {
      await reorderProductImages([{ id: a.id, position: b.position }, { id: b.id, position: a.position }]);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de réorganiser les images.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (img: ProductImage) => {
    confirmAction({
      title: 'Supprimer cette image ?',
      message: img.is_primary
        ? "C'est l'image principale du produit — une autre image sera automatiquement désignée à sa place s'il y en a."
        : 'Cette image sera définitivement retirée de la galerie.',
      danger: true,
      confirmLabel: 'Supprimer',
      successMessage: 'Image supprimée.',
      onConfirm: async () => {
        await deleteProductImage(img.id);
        await refresh();
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-sand-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200 dark:border-sand-700 sticky top-0 bg-white dark:bg-sand-800 z-10">
          <div>
            <h2 className="font-display text-lg font-bold text-sand-900 dark:text-sand-50">Images — {product.name}</h2>
            <p className="text-xs text-sand-400">Réorganisez, choisissez l'image principale, associez une couleur si besoin</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3">
          {loadError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2 text-sm text-red-700 dark:text-red-400"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {loadError}</div>
          )}

          {loading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : images.length === 0 ? (
            <div className="card p-6 text-center text-sand-400 text-sm">Aucune image pour le moment.</div>
          ) : (
            <div className="space-y-2">
              {images.map((img, index) => (
                <div key={img.id} className={`card p-3 flex items-center gap-3 ${img.is_primary ? 'ring-2 ring-ocre-400' : ''}`}>
                  <img src={img.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    {img.is_primary && <span className="badge bg-ocre-100 text-ocre-700 inline-flex items-center gap-1"><Star className="w-3 h-3 fill-ocre-500 text-ocre-500" /> Principale</span>}
                    <input
                      className="input py-1 text-xs w-full"
                      placeholder="Couleur associée (facultatif)"
                      defaultValue={img.color ?? ''}
                      onBlur={(e) => { if (e.target.value !== (img.color ?? '')) void setColor(img, e.target.value); }}
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => void move(index, -1)} disabled={index === 0 || busy} className="w-7 h-7 rounded-lg hover:bg-sand-100 flex items-center justify-center text-sand-500 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => void move(index, 1)} disabled={index === images.length - 1 || busy} className="w-7 h-7 rounded-lg hover:bg-sand-100 flex items-center justify-center text-sand-500 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                    {!img.is_primary && <button onClick={() => void makePrimary(img)} disabled={busy} title="Définir comme image principale" className="w-7 h-7 rounded-lg hover:bg-ocre-50 flex items-center justify-center text-ocre-500 disabled:opacity-50 shrink-0"><Star className="w-3.5 h-3.5" /></button>}
                    <button onClick={() => remove(img)} className="w-7 h-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center text-red-500 dark:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-sand-300 text-sand-600 hover:bg-sand-50 dark:hover:bg-sand-700 text-sm font-medium disabled:opacity-50">
            <ImagePlus className="w-4 h-4" /> {uploading ? 'Envoi...' : 'Ajouter une image'}
          </button>
          <p className="text-xs text-sand-400 text-center">JPG, PNG ou WebP — 5 Mo maximum</p>
        </div>
      </div>
    </div>
  );
}
