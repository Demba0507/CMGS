import { useState, useEffect, useCallback } from 'react';
import { X, Star, Trash2, Plus, AlertCircle } from 'lucide-react';
import { listProductSuppliers, addProductSupplier, setPrimarySupplier, removeProductSupplier } from '@/lib/suppliers';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import type { Product, Supplier, ProductSupplier } from '@/lib/types';
import { formatFCFA } from '@/lib/format';

export default function SupplierPanel({
  product, suppliers, onClose, onChanged,
}: {
  product: Product; suppliers: Supplier[]; onClose: () => void; onChanged: () => void;
}) {
  const { confirmAction } = useConfirm();
  const toast = useToast();
  const [links, setLinks] = useState<ProductSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setLinks(await listProductSuppliers(product.id));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => { void load(); }, [load]);

  const refresh = () => { void load(); onChanged(); };

  const linkedSupplierIds = new Set(links.map((l) => l.supplier_id));
  const availableSuppliers = suppliers.filter((s) => s.status === 'APPROVED' && !s.deleted_at && !linkedSupplierIds.has(s.id));

  const makePrimary = async (supplierId: string) => {
    try {
      await setPrimarySupplier(product.id, supplierId);
      refresh();
      toast.success('Fournisseur prioritaire mis à jour.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de changer le fournisseur prioritaire.');
    }
  };

  const remove = (link: ProductSupplier) => {
    const supplierName = suppliers.find((s) => s.id === link.supplier_id)?.name ?? 'ce fournisseur';
    confirmAction({
      title: 'Retirer ce fournisseur ?',
      message: `« ${supplierName} » ne sera plus associé à « ${product.name} ». Cette action est réversible en le ré-associant.`,
      danger: true,
      confirmLabel: 'Retirer',
      successMessage: 'Fournisseur retiré.',
      onConfirm: async () => {
        await removeProductSupplier(link.id);
        refresh();
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-sand-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200 dark:border-sand-700 sticky top-0 bg-white dark:bg-sand-800 z-10">
          <div>
            <h2 className="font-display text-lg font-bold text-sand-900 dark:text-sand-50">Fournisseurs — {product.name}</h2>
            <p className="text-xs text-sand-400 dark:text-sand-500">Comparaison des prix par fournisseur — le stock se gère directement sur la fiche produit</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {loadError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2 text-sm text-red-700 dark:text-red-400"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {loadError}</div>
          )}

          {loading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : links.length === 0 ? (
            <div className="card p-6 text-center text-sand-400 dark:text-sand-500 text-sm">Aucun fournisseur associé pour le moment.</div>
          ) : (
            <div className="space-y-2">
              {links.map((link) => {
                const supplier = suppliers.find((s) => s.id === link.supplier_id);
                return (
                  <SupplierLinkCard
                    key={link.id}
                    link={link}
                    supplierName={supplier?.name ?? 'Fournisseur inconnu'}
                    onMakePrimary={() => void makePrimary(link.supplier_id)}
                    onRemove={() => remove(link)}
                  />
                );
              })}
            </div>
          )}

          {showAdd ? (
            <AddSupplierForm
              productId={product.id}
              availableSuppliers={availableSuppliers}
              hasExistingSuppliers={links.length > 0}
              onCancel={() => setShowAdd(false)}
              onAdded={() => { setShowAdd(false); refresh(); }}
            />
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              disabled={availableSuppliers.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-sand-300 dark:border-sand-600 text-sand-600 dark:text-sand-300 hover:bg-sand-50 dark:hover:bg-sand-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" /> {availableSuppliers.length === 0 ? 'Tous les fournisseurs approuvés sont déjà associés' : 'Associer un fournisseur'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SupplierLinkCard({
  link, supplierName, onMakePrimary, onRemove,
}: {
  link: ProductSupplier; supplierName: string;
  onMakePrimary: () => void; onRemove: () => void;
}) {
  return (
    <div className={`card p-4 ${link.is_primary ? 'ring-2 ring-ocre-400' : ''}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 min-w-0">
          {link.is_primary ? <Star className="w-4 h-4 text-ocre-500 fill-ocre-500 shrink-0" /> : <Star className="w-4 h-4 text-sand-300 dark:text-sand-600 shrink-0" />}
          <div className="min-w-0">
            <div className="font-medium text-sand-900 dark:text-sand-100 text-sm truncate">{supplierName}{link.is_primary && <span className="ml-2 badge bg-ocre-100 dark:bg-ocre-900/40 text-ocre-700 dark:text-ocre-300">Prioritaire</span>}</div>
            <div className="text-xs text-sand-400 dark:text-sand-500 truncate">
              Prix initial : {formatFCFA(link.initial_supplier_price)} · Achat RATELAFRICA : {formatFCFA(link.purchase_price)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!link.is_primary && (
            <button onClick={onMakePrimary} title="Définir comme fournisseur prioritaire" className="w-8 h-8 rounded-lg hover:bg-ocre-50 flex items-center justify-center text-ocre-500"><Star className="w-4 h-4" /></button>
          )}
          <button onClick={onRemove} className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center text-red-500 dark:text-red-400"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

function AddSupplierForm({
  productId, availableSuppliers, hasExistingSuppliers, onCancel, onAdded,
}: {
  productId: string; availableSuppliers: Supplier[]; hasExistingSuppliers: boolean; onCancel: () => void; onAdded: () => void;
}) {
  const [supplierId, setSupplierId] = useState(availableSuppliers[0]?.id ?? '');
  const [initialPrice, setInitialPrice] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [makePrimary, setMakePrimary] = useState(!hasExistingSuppliers);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const submit = async () => {
    if (!supplierId) { setError('Choisissez un fournisseur.'); return; }
    setSaving(true);
    setError(null);
    try {
      await addProductSupplier(productId, supplierId, initialPrice, purchasePrice, makePrimary);
      toast.success('Fournisseur associé au produit.');
      onAdded();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible d'associer ce fournisseur.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-4 space-y-3">
      <div>
        <label className="label">Fournisseur</label>
        <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          {availableSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Prix initial fournisseur</label><input type="number" min="0" className="input" value={initialPrice} onChange={(e) => setInitialPrice(Math.max(0, parseInt(e.target.value) || 0))} /></div>
        <div><label className="label">Prix d'achat RATELAFRICA</label><input type="number" min="0" className="input" value={purchasePrice} onChange={(e) => setPurchasePrice(Math.max(0, parseInt(e.target.value) || 0))} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm text-sand-700 dark:text-sand-300">
        <input type="checkbox" checked={makePrimary} disabled={!hasExistingSuppliers} className="accent-ocre-600" onChange={(e) => setMakePrimary(e.target.checked)} />
        Définir comme fournisseur prioritaire{!hasExistingSuppliers && ' (automatique : premier fournisseur du produit)'}
      </label>
      {purchasePrice > 0 && <p className="text-xs text-sand-500 dark:text-sand-400">Commission RATELAFRICA estimée : {formatFCFA(Math.floor(purchasePrice / 10000))}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-lg border border-sand-200 dark:border-sand-600 text-sand-600 dark:text-sand-300 hover:bg-sand-50 dark:hover:bg-sand-700 text-sm font-medium">Annuler</button>
        <button onClick={() => void submit()} disabled={saving} className="btn-primary flex-1">{saving ? 'Association...' : 'Associer'}</button>
      </div>
    </div>
  );
}
