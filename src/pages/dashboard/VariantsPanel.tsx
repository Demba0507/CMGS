import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, Trash2, ImagePlus, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { listProductVariants, createProductVariant, updateProductVariant, deleteProductVariant } from '@/lib/variants';
import { validateProductImage, ALLOWED_IMAGE_TYPES } from '@/lib/imageValidation';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import type { Product, ProductVariant } from '@/lib/types';

export default function VariantsPanel({ product, onClose }: { product: Product; onClose: () => void }) {
  const { confirmAction } = useConfirm();
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setVariants(await listProductVariants(product.id));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => { void load(); }, [load]);

  const remove = (variant: ProductVariant) => {
    confirmAction({
      title: 'Supprimer cette variante ?',
      message: `${[variant.color, variant.size].filter(Boolean).join(' / ') || 'Cette variante'} sera définitivement retirée de « ${product.name} ».`,
      danger: true,
      confirmLabel: 'Supprimer',
      successMessage: 'Variante supprimée.',
      onConfirm: async () => {
        await deleteProductVariant(variant.id);
        void load();
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-sand-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200 dark:border-sand-700 sticky top-0 bg-white dark:bg-sand-800 z-10">
          <div>
            <h2 className="font-display text-lg font-bold text-sand-900 dark:text-sand-50">Variantes — {product.name}</h2>
            <p className="text-xs text-sand-400">Couleur, taille, stock et image propres à chaque variante — le prix reste unique pour tout le produit</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {loadError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/30 p-3 flex items-start gap-2 text-sm text-red-700 dark:text-red-300"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {loadError}</div>
          )}

          {loading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : variants.length === 0 ? (
            <div className="card p-6 text-center text-sand-400 text-sm">Aucune variante — ce produit utilise le stock unique de sa fiche.</div>
          ) : (
            <div className="space-y-2">
              {variants.map((v) => (
                <VariantRow key={v.id} variant={v} onSaved={load} onRemove={() => remove(v)} />
              ))}
            </div>
          )}

          {showAdd ? (
            <VariantForm
              productId={product.id}
              onCancel={() => setShowAdd(false)}
              onAdded={() => { setShowAdd(false); void load(); }}
              fileInputRef={fileInputRef}
            />
          ) : (
            <button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-sand-300 text-sand-600 hover:bg-sand-50 dark:hover:bg-sand-700 text-sm font-medium">
              <Plus className="w-4 h-4" /> Ajouter une variante
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

async function uploadVariantImage(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filePath = `variants/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('product-images').upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw new Error(friendlyError(error, "Échec de l'upload de l'image."));
  return supabase.storage.from('product-images').getPublicUrl(filePath).data.publicUrl;
}

function VariantRow({ variant, onSaved, onRemove }: { variant: ProductVariant; onSaved: () => void; onRemove: () => void }) {
  const toast = useToast();
  const [stock, setStock] = useState(String(variant.stock));
  const [saving, setSaving] = useState(false);

  const saveStock = async () => {
    const value = Math.max(0, parseInt(stock, 10) || 0);
    if (value === variant.stock) return;
    setSaving(true);
    try {
      await updateProductVariant(variant.id, { color: variant.color, size: variant.size, stock: value, image_url: variant.image_url });
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de modifier le stock.');
      setStock(String(variant.stock));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-3 flex items-center gap-2 sm:gap-3">
      {variant.image_url ? <img src={variant.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" /> : <div className="w-10 h-10 rounded-lg bg-sand-100 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-sand-900 truncate">{[variant.color, variant.size].filter(Boolean).join(' / ')}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <label className="text-xs text-sand-500 hidden sm:inline">Stock</label>
        <input type="number" min="0" aria-label="Stock" className="input w-16 sm:w-20 py-1.5 text-sm" value={stock} disabled={saving} onChange={(e) => setStock(e.target.value)} onBlur={() => void saveStock()} />
      </div>
      <button onClick={onRemove} className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center text-red-500 dark:text-red-400 shrink-0"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

function VariantForm({ productId, onCancel, onAdded, fileInputRef }: { productId: string; onCancel: () => void; onAdded: () => void; fileInputRef: React.RefObject<HTMLInputElement> }) {
  const toast = useToast();
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [stock, setStock] = useState('0');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!color.trim() && !size.trim()) { setError('Renseignez au moins une couleur ou une taille.'); return; }
    setSaving(true);
    setError(null);
    try {
      const imageUrl = imageFile ? await uploadVariantImage(imageFile) : null;
      await createProductVariant({
        product_id: productId,
        color: color.trim() || null,
        size: size.trim() || null,
        stock: Math.max(0, parseInt(stock, 10) || 0),
        image_url: imageUrl,
      });
      toast.success('Variante ajoutée.');
      onAdded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible d'ajouter cette variante.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Couleur</label><input className="input" placeholder="Ex: Rouge" value={color} onChange={(e) => setColor(e.target.value)} /></div>
        <div><label className="label">Taille</label><input className="input" placeholder="Ex: M" value={size} onChange={(e) => setSize(e.target.value)} /></div>
      </div>
      <div><label className="label">Stock</label><input type="number" min="0" className="input" value={stock} onChange={(e) => setStock(e.target.value)} /></div>
      <div>
        <label className="label">Image de cette variante (facultatif)</label>
        <div className="flex items-center gap-3">
          {imagePreview ? <img src={imagePreview} alt="" className="w-14 h-14 rounded-lg object-cover" /> : <div className="w-14 h-14 rounded-lg bg-sand-100 flex items-center justify-center text-sand-300"><ImagePlus className="w-5 h-5" /></div>}
          <input ref={fileInputRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const validationError = validateProductImage(f);
            if (validationError) { setError(validationError); e.target.value = ''; return; }
            setError(null);
            setImageFile(f); setImagePreview(URL.createObjectURL(f));
          }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-lg border border-sand-200 text-sm text-sand-600 hover:bg-sand-50 dark:hover:bg-sand-700">Choisir une image</button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-lg border border-sand-200 text-sand-600 hover:bg-sand-50 dark:hover:bg-sand-700 text-sm font-medium">Annuler</button>
        <button onClick={() => void submit()} disabled={saving} className="btn-primary flex-1">{saving ? 'Ajout...' : 'Ajouter'}</button>
      </div>
    </div>
  );
}
