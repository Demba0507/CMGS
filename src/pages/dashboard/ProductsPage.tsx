import { useState, useEffect, useRef } from 'react';
import { Plus, Search, Package, Edit2, Trash2, X, AlertTriangle, Truck, ImagePlus, Layers, Images, ArchiveRestore, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { logAuditEvent } from '@/lib/audit';
import { usePermissions } from '@/lib/permissions';
import { deleteProduct, restoreProduct, purgeProduct } from '@/lib/products';
import { friendlyError } from '@/lib/errors';
import type { Product, Category, Supplier, ProductStatus } from '@/lib/types';
import { formatFCFA } from '@/lib/format';
import ExportButtons from '@/components/ExportButtons';
import type { ExportColumn } from '@/lib/export';
import SupplierPanel from '@/pages/dashboard/SupplierPanel';
import VariantsPanel from '@/pages/dashboard/VariantsPanel';
import ImagesPanel from '@/pages/dashboard/ImagesPanel';
import TrashActionsBar from '@/components/TrashActionsBar';
import { validateProductImage, ALLOWED_IMAGE_TYPES } from '@/lib/imageValidation';

const productExportColumns: ExportColumn<Product>[] = [
  { label: 'Code', value: (p) => p.code },
  { label: 'Nom', value: (p) => p.name },
  { label: 'Prix fournisseur', value: (p) => p.supplier_price },
  { label: 'Prix de vente', value: (p) => p.sale_price },
  { label: 'Marge', value: (p) => p.sale_price - p.supplier_price },
  { label: 'Stock', value: (p) => p.stock },
  { label: 'Statut', value: (p) => p.status },
];

export default function ProductsPage() {
  const { confirmAction } = useConfirm();
  const toast = useToast();
  const { has } = usePermissions();
  const canCreate = has('products.create');
  const canEdit = has('products.edit');
  const canDelete = has('products.delete');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'price_asc' | 'price_desc' | 'stock_asc'>('recent');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [supplierPanelProduct, setSupplierPanelProduct] = useState<Product | null>(null);
  const [variantsPanelProduct, setVariantsPanelProduct] = useState<Product | null>(null);
  const [imagesPanelProduct, setImagesPanelProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTrash, setShowTrash] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [listLimit, setListLimit] = useState(200);
  const [hasMore, setHasMore] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: c }, { data: s }] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }).limit(listLimit),
      supabase.from('categories').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
    ]);
    setProducts((p as Product[]) ?? []);
    setHasMore((p?.length ?? 0) === listLimit);
    setCategories((c as Category[]) ?? []);
    setSuppliers((s as Supplier[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [listLimit]);

  const filtered = products
    .filter((p) => {
      if (showTrash ? !p.deleted_at : !!p.deleted_at) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.code.toLowerCase().includes(search.toLowerCase())) return false;
      if (!showTrash && filterCat && p.category_id !== filterCat) return false;
      if (!showTrash && filterStatus && p.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'price_asc': return a.sale_price - b.sale_price;
        case 'price_desc': return b.sale_price - a.sale_price;
        case 'stock_asc': return a.stock - b.stock;
        default: return 0; // déjà triés par date de création côté requête
      }
    });

  const trashCount = products.filter((p) => !!p.deleted_at).length;

  const handleDelete = (product: Product) => {
    confirmAction({
      title: 'Supprimer ce produit ?',
      message: `« ${product.name} » sera déplacé en corbeille et ne sera plus visible sur la boutique. Il pourra être restauré si besoin.`,
      danger: true,
      confirmLabel: 'Supprimer',
      successMessage: 'Produit déplacé en corbeille.',
      onConfirm: async () => {
        await deleteProduct(product.id);
        await load();
      },
    });
  };

  const handleRestore = (product: Product) => {
    confirmAction({
      title: 'Restaurer ce produit ?',
      message: `« ${product.name} » redeviendra visible dans le catalogue et sur la boutique.`,
      confirmLabel: 'Restaurer',
      successMessage: 'Produit restauré avec succès.',
      onConfirm: async () => {
        await restoreProduct(product.id);
        await load();
      },
    });
  };

  const allSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(filtered.map((p) => p.id)));
  const toggleOne = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const purgeMany = (ids: string[]) => {
    if (ids.length === 0 || bulkBusy) return;
    confirmAction({
      title: ids.length === 1 ? 'Supprimer définitivement ce produit ?' : `Supprimer définitivement ${ids.length} produits ?`,
      message: 'Cette action est irréversible : ils seront effacés de façon permanente et ne pourront plus être restaurés.',
      danger: true,
      confirmLabel: 'Supprimer définitivement',
      successMessage: ids.length === 1 ? 'Produit supprimé définitivement.' : `${ids.length} produits supprimés définitivement.`,
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          for (const id of ids) await purgeProduct(id);
        } finally {
          setBulkBusy(false);
        }
        setSelectedIds(new Set());
        await load();
      },
    });
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-sand-900 dark:text-sand-100">{filtered.length} produits</h2>
          <p className="text-sm text-sand-500 dark:text-sand-400">Gérez votre catalogue</p>
        </div>
        <div className="flex items-center gap-2">
          {!showTrash && <ExportButtons filename="produits-ratelafrica" title="Catalogue produits RATELAFRICA" columns={productExportColumns} rows={filtered} />}
          {canDelete && (
            <button onClick={() => { setShowTrash((v) => !v); setSelectedIds(new Set()); }} className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 ${showTrash ? 'bg-ocre-600 text-white' : 'bg-sand-100 text-sand-600 hover:bg-sand-200'}`}>
              <Trash2 className="w-3.5 h-3.5" /> {showTrash ? 'Retour aux produits' : `Corbeille${trashCount > 0 ? ` (${trashCount})` : ''}`}
            </button>
          )}
          {!showTrash && canCreate && (
            <button onClick={() => { setEditProduct(null); setShowForm(true); }} className="btn-primary"><Plus className="w-4 h-4" /> Ajouter un produit</button>
          )}
        </div>
      </div>

      {showTrash && (
        <TrashActionsBar
          count={filtered.length}
          selectedCount={selectedIds.size}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onDeleteSelected={() => purgeMany([...selectedIds])}
          onEmptyTrash={() => purgeMany(filtered.map((p) => p.id))}
          busy={bulkBusy}
        />
      )}

      {!showTrash && (
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400 dark:text-sand-500" />
          <input className="input pl-10" placeholder="Rechercher par nom ou code..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input max-w-[200px]" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Toutes catégories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input max-w-[160px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="ACTIVE">Actif</option>
          <option value="INACTIVE">Inactif</option>
          <option value="OUT_OF_STOCK">Rupture de stock</option>
        </select>
        <select className="input max-w-[180px]" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
          <option value="recent">Plus récents</option>
          <option value="name">Nom (A→Z)</option>
          <option value="price_asc">Prix croissant</option>
          <option value="price_desc">Prix décroissant</option>
          <option value="stock_asc">Stock croissant</option>
        </select>
      </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center"><Package className="w-12 h-12 text-sand-300 mx-auto mb-3" /><p className="text-sand-500 dark:text-sand-400">{showTrash ? 'La corbeille est vide.' : 'Aucun produit trouvé'}</p></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand-50 dark:bg-sand-900/50 border-b border-sand-200 dark:border-sand-700">
                <tr>
                  {showTrash && <th className="w-10 px-4 py-3"></th>}
                  <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Code</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Produit</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300 hidden md:table-cell">Catégorie</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300 hidden lg:table-cell">Fournisseur</th>
                  <th className="text-right px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Prix vente</th>
                  <th className="text-right px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Stock</th>
                  <th className="text-center px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Statut</th>
                  <th className="text-right px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100 dark:divide-sand-700">
                {filtered.map((p) => {
                  const cat = categories.find((c) => c.id === p.category_id);
                  const sup = suppliers.find((s) => s.id === p.supplier_id);
                  const lowStock = p.stock > 0 && p.stock <= (p.low_stock_threshold ?? 5);
                  const outOfStock = p.stock <= 0;
                  return (
                    <tr key={p.id} className="hover:bg-sand-50 dark:hover:bg-sand-700 transition-colors">
                      {showTrash && (
                        <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleOne(p.id)} className="rounded" /></td>
                      )}
                      <td className="px-4 py-3"><span className="font-mono text-xs text-sand-500 dark:text-sand-400">{p.code}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.image_url && <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                          <span className="font-medium text-sand-900 dark:text-sand-100">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-sand-600 dark:text-sand-300">{cat?.name ?? '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-sand-600 dark:text-sand-300">{sup?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-sand-900 dark:text-sand-100">{formatFCFA(p.sale_price)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-medium ${outOfStock ? 'text-red-600' : lowStock ? 'text-ocre-600' : 'text-sand-700'}`}>{p.stock}</span>
                        {lowStock && <AlertTriangle className="w-3 h-3 text-ocre-500 inline ml-1" />}
                      </td>
                      <td className="px-4 py-3 text-center"><span className={`badge ${p.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-sand-200 dark:bg-sand-700 text-sand-600 dark:text-sand-300'}`}>{p.status === 'ACTIVE' ? 'Actif' : 'Inactif'}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {showTrash ? (
                            <>
                              {canDelete && <button onClick={() => handleRestore(p)} className="w-8 h-8 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400" title="Restaurer"><ArchiveRestore className="w-4 h-4" /></button>}
                              {canDelete && <button onClick={() => purgeMany([p.id])} className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center text-red-500 dark:text-red-400" title="Supprimer définitivement"><ShieldAlert className="w-4 h-4" /></button>}
                            </>
                          ) : (
                            <>
                              <button onClick={() => setSupplierPanelProduct(p)} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center text-sand-600 dark:text-sand-300" title="Fournisseurs (prix)"><Truck className="w-4 h-4" /></button>
                              <button onClick={() => setVariantsPanelProduct(p)} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center text-sand-600 dark:text-sand-300" title="Variantes (couleur/taille)"><Layers className="w-4 h-4" /></button>
                              <button onClick={() => setImagesPanelProduct(p)} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center text-sand-600 dark:text-sand-300" title="Galerie d'images"><Images className="w-4 h-4" /></button>
                              {canEdit && <button onClick={() => { setEditProduct(p); setShowForm(true); }} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center text-sand-600 dark:text-sand-300"><Edit2 className="w-4 h-4" /></button>}
                              {canDelete && <button onClick={() => handleDelete(p)} className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center text-red-500 dark:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasMore && !showTrash && (
        <div className="flex justify-center">
          <button onClick={() => setListLimit((l) => l + 200)} disabled={loading} className="btn-secondary text-sm">{loading ? 'Chargement...' : 'Charger plus de produits'}</button>
        </div>
      )}

      {showForm && <ProductForm product={editProduct} categories={categories} suppliers={suppliers} onClose={() => setShowForm(false)} onSaved={(createdProduct) => {
        setShowForm(false);
        load();
        toast.success('Produit enregistré avec succès.');
        // Un produit vient d'être créé : product_variants a besoin d'un product_id réel,
        // donc les variantes ne peuvent être ajoutées qu'une fois le produit enregistré.
        // On ouvre directement le panneau pour éviter que ce second geste soit invisible.
        if (createdProduct) {
          setVariantsPanelProduct(createdProduct);
        }
      }} />}
      {supplierPanelProduct && (
        <SupplierPanel
          product={supplierPanelProduct}
          suppliers={suppliers}
          onClose={() => setSupplierPanelProduct(null)}
          onChanged={() => load()}
        />
      )}
      {variantsPanelProduct && (
        <VariantsPanel
          product={variantsPanelProduct}
          onClose={() => setVariantsPanelProduct(null)}
        />
      )}
      {imagesPanelProduct && (
        <ImagesPanel
          product={imagesPanelProduct}
          onClose={() => setImagesPanelProduct(null)}
          onChanged={() => load()}
        />
      )}
    </div>
  );
}

function ProductForm({ product, categories, suppliers, onClose, onSaved }: { product: Product | null; categories: Category[]; suppliers: Supplier[]; onClose: () => void; onSaved: (createdProduct?: Product) => void }) {
  const [form, setForm] = useState({
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    description: product?.description ?? '',
    category_id: product?.category_id ?? '',
    supplier_id: product?.supplier_id ?? '',
    supplier_price: product?.supplier_price ?? 0,
    purchase_price: product?.purchase_price ?? product?.supplier_price ?? 0,
    sale_price: product?.sale_price ?? 0,
    stock: product?.stock ?? 0,
    low_stock_threshold: product?.low_stock_threshold ?? 5,
    image_url: product?.image_url ?? '',
    status: product?.status ?? 'ACTIVE',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(product?.image_url ?? '');
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!imageFile) return;
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  const handleImageChange = (file: File | null) => {
    if (!file) return;
    const validationError = validateProductImage(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setImageFile(file);
  };

  const uploadImage = async () => {
    if (!imageFile) return form.image_url;
    const extension = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `products/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, imageFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: imageFile.type,
      });
    if (uploadError) throw new Error(friendlyError(uploadError, "Échec de l'upload de l'image."));
    const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const commission = Math.floor((form.purchase_price * 1) / 10000);

  const save = async () => {
    if (!form.name) { setError('Nom requis'); return; }
    setSaving(true);
    setError(null);
    try {
      const imageUrl = await uploadImage();
      const payload = {
      ...form,
      image_url: imageUrl || null,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      stock_last_checked: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
      if (product) {
      const { error } = await supabase.from('products').update(payload).eq('id', product.id);
      if (error) setError(friendlyError(error, 'Impossible d’enregistrer le produit.'));
      else {
        await logAuditEvent('PRODUCT_UPDATED', 'product', product.id, `Produit modifié : ${form.name}`, product, payload);
        onSaved();
      }
    } else {
      const { data, error } = await supabase.from('products').insert(payload).select('*').single();
      if (error) setError(friendlyError(error, 'Impossible d’enregistrer le produit.'));
      else {
        await logAuditEvent('PRODUCT_CREATED', 'product', data?.id ?? null, `Produit créé : ${form.name}`, null, payload);
        onSaved(data as Product);
      }
      }
      setSaving(false);
    } catch (e) {
      setError(friendlyError(e, 'Impossible d’enregistrer le produit.'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-sand-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200 dark:border-sand-700 sticky top-0 bg-white dark:bg-sand-800 z-10">
          <h2 className="font-display text-lg font-bold text-sand-900 dark:text-sand-50">{product ? 'Modifier le produit' : 'Nouveau produit'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Code produit</label><input className="input font-mono bg-sand-50 dark:bg-sand-800 text-sand-500 dark:text-sand-400" value={product?.code ?? 'Attribué automatiquement à la création'} disabled title="Le code est attribué et renuméroté automatiquement — il n'est jamais modifiable manuellement." /></div>
            <div><label className="label">Statut</label><select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProductStatus })}><option value="ACTIVE">Actif</option><option value="INACTIVE">Inactif</option><option value="OUT_OF_STOCK">Rupture</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-4"><div><label className="label">Nom du produit *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div><label className="label">Marque</label><input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Ex: Samsung" /></div></div>
          <div><label className="label">Description</label><textarea className="input min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Catégorie</label><select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="label">Fournisseur</label><select className="input" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}><option value="">—</option>{suppliers.filter((s) => s.status === 'APPROVED' && !s.deleted_at).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Prix d'achat RATELAFRICA</label><input type="number" min="0" className="input" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: parseInt(e.target.value) || 0, supplier_price: parseInt(e.target.value) || 0 })} /></div>
            <div><label className="label">Prix de vente (FCFA)</label><input type="number" className="input" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: parseInt(e.target.value) || 0 })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Stock</label><input type="number" min="0" className="input" value={form.stock} onChange={(e) => setForm({ ...form, stock: Math.max(0, parseInt(e.target.value) || 0) })} /></div>
            <div><label className="label">Seuil stock faible</label><input type="number" min="0" className="input" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: Math.max(0, parseInt(e.target.value) || 0) })} /></div>
          </div>
          <div>
            <label className="label">Image du produit</label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="btn-secondary flex items-center gap-2"
              >
                <ImagePlus className="w-4 h-4" />
                {imageFile ? 'Changer l’image' : 'Choisir une image'}
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(',')}
                className="hidden"
                onChange={(e) => {
                  handleImageChange(e.target.files?.[0] ?? null);
                  e.currentTarget.value = '';
                }}
              />
              {imagePreview && (
                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-sand-200 dark:border-sand-600 bg-sand-50 dark:bg-sand-900">
                  <img src={imagePreview} alt="Aperçu" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreview(''); setForm({ ...form, image_url: '' }); }}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                    title="Supprimer l’image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-sand-500 dark:text-sand-400 mt-2">JPG, PNG ou WebP · 5 Mo maximum</p>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 bg-sand-50 dark:bg-sand-900 rounded-xl">
            <div><div className="text-xs text-sand-500 dark:text-sand-400">Marge commerciale</div><div className="font-bold text-green-700">{formatFCFA(form.sale_price - form.purchase_price)}</div></div>
            <div><div className="text-xs text-sand-500 dark:text-sand-400">Commission fournisseur (0,01%)</div><div className="font-bold text-ocre-700">{formatFCFA(commission)}</div></div>
          </div>

          {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-sand-200 dark:border-sand-700 sticky bottom-0 bg-white">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Sauvegarde...' : 'Sauvegarder'}</button>
        </div>
      </div>
    </div>
  );
}
