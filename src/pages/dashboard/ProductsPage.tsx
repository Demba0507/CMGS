import { useState, useEffect } from 'react';
import { Plus, Search, Package, Edit2, Trash2, X, AlertTriangle, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { logAuditEvent } from '@/lib/audit';
import type { Product, Category, Supplier, ProductStatus } from '@/lib/types';
import { formatFCFA } from '@/lib/format';
import SupplierPanel from '@/pages/dashboard/SupplierPanel';
import ExportButtons from '@/components/ExportButtons';
import type { ExportColumn } from '@/lib/export';

const productExportColumns: ExportColumn<Product>[] = [
  { label: 'Code', value: (p) => p.code },
  { label: 'Nom', value: (p) => p.name },
  { label: 'Prix fournisseur', value: (p) => p.supplier_price },
  { label: 'Prix de vente', value: (p) => p.sale_price },
  { label: 'Marge', value: (p) => p.sale_price - p.supplier_price },
  { label: 'Stock', value: (p) => p.stock_verified },
  { label: 'Statut', value: (p) => p.status },
];

export default function ProductsPage() {
  const { confirmAction } = useConfirm();
  const toast = useToast();
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
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: c }, { data: s }] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
    ]);
    setProducts((p as Product[]) ?? []);
    setCategories((c as Category[]) ?? []);
    setSuppliers((s as Supplier[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = products
    .filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.code.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCat && p.category_id !== filterCat) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'price_asc': return a.sale_price - b.sale_price;
        case 'price_desc': return b.sale_price - a.sale_price;
        case 'stock_asc': return a.stock_verified - b.stock_verified;
        default: return 0; // déjà triés par date de création côté requête
      }
    });

  const handleDelete = (product: Product) => {
    confirmAction({
      title: 'Supprimer ce produit ?',
      message: `« ${product.name} » sera désactivé et ne sera plus visible sur la boutique. Cette action est réversible depuis la fiche produit.`,
      danger: true,
      confirmLabel: 'Supprimer',
      successMessage: 'Produit supprimé avec succès.',
      onConfirm: async () => {
        const { error } = await supabase.from('products').update({ status: 'INACTIVE' }).eq('id', product.id);
        if (error) throw new Error('Impossible de supprimer ce produit.');
        await logAuditEvent('PRODUCT_DELETED', 'product', product.id, `Produit désactivé : ${product.name}`, product.status, 'INACTIVE');
        await load();
      },
    });
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-sand-900">{products.length} produits</h2>
          <p className="text-sm text-sand-500">Gérez votre catalogue</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons filename="produits-cmgs" title="Catalogue produits CMGS" columns={productExportColumns} rows={filtered} />
          <button onClick={() => { setEditProduct(null); setShowForm(true); }} className="btn-primary"><Plus className="w-4 h-4" /> Ajouter un produit</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400" />
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

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center"><Package className="w-12 h-12 text-sand-300 mx-auto mb-3" /><p className="text-sand-500">Aucun produit trouvé</p></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand-50 border-b border-sand-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-sand-600">Code</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600">Produit</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 hidden md:table-cell">Catégorie</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 hidden lg:table-cell">Fournisseur</th>
                  <th className="text-right px-4 py-3 font-medium text-sand-600">Prix vente</th>
                  <th className="text-right px-4 py-3 font-medium text-sand-600">Stock</th>
                  <th className="text-center px-4 py-3 font-medium text-sand-600">Statut</th>
                  <th className="text-right px-4 py-3 font-medium text-sand-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {filtered.map((p) => {
                  const cat = categories.find((c) => c.id === p.category_id);
                  const sup = suppliers.find((s) => s.id === p.supplier_id);
                  const lowStock = p.stock_verified > 0 && p.stock_verified <= (p.low_stock_threshold ?? 5);
                  const outOfStock = p.stock_verified <= 0;
                  return (
                    <tr key={p.id} className="hover:bg-sand-50 transition-colors">
                      <td className="px-4 py-3"><span className="font-mono text-xs text-sand-500">{p.code}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.image_url && <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                          <span className="font-medium text-sand-900">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-sand-600">{cat?.name ?? '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-sand-600">{sup?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-sand-900">{formatFCFA(p.sale_price)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-medium ${outOfStock ? 'text-red-600' : lowStock ? 'text-ocre-600' : 'text-sand-700'}`}>{p.stock_verified}</span>
                        {lowStock && <AlertTriangle className="w-3 h-3 text-ocre-500 inline ml-1" />}
                      </td>
                      <td className="px-4 py-3 text-center"><span className={`badge ${p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-sand-200 text-sand-600'}`}>{p.status === 'ACTIVE' ? 'Actif' : 'Inactif'}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setSupplierPanelProduct(p)} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center text-sand-600" title="Fournisseurs et stock"><Truck className="w-4 h-4" /></button>
                          <button onClick={() => { setEditProduct(p); setShowForm(true); }} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center text-sand-600"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(p)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-500"><Trash2 className="w-4 h-4" /></button>
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

      {showForm && <ProductForm product={editProduct} categories={categories} suppliers={suppliers} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); toast.success('Produit enregistré avec succès.'); }} />}
      {supplierPanelProduct && (
        <SupplierPanel
          product={supplierPanelProduct}
          suppliers={suppliers}
          onClose={() => setSupplierPanelProduct(null)}
          onChanged={() => load()}
        />
      )}
    </div>
  );
}

function ProductForm({ product, categories, suppliers, onClose, onSaved }: { product: Product | null; categories: Category[]; suppliers: Supplier[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: product?.code ?? `P${String(Date.now()).slice(-4)}`,
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    description: product?.description ?? '',
    category_id: product?.category_id ?? '',
    supplier_id: product?.supplier_id ?? '',
    supplier_price: product?.supplier_price ?? 0,
    initial_supplier_price: product?.initial_supplier_price ?? product?.supplier_price ?? 0,
    purchase_price: product?.purchase_price ?? product?.supplier_price ?? 0,
    sale_price: product?.sale_price ?? 0,
    stock_declared: product?.stock_declared ?? 0,
    stock_verified: product?.stock_verified ?? 0,
    low_stock_threshold: product?.low_stock_threshold ?? 5,
    image_url: product?.image_url ?? '',
    status: product?.status ?? 'ACTIVE',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commission = Math.floor((form.purchase_price * 1) / 10000);

  const save = async () => {
    if (!form.name || !form.code) { setError('Nom et code requis'); return; }
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      stock_last_checked: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (product) {
      const { error } = await supabase.from('products').update(payload).eq('id', product.id);
      if (error) setError(error.message);
      else {
        await logAuditEvent('PRODUCT_UPDATED', 'product', product.id, `Produit modifié : ${form.name}`, product, payload);
        onSaved();
      }
    } else {
      const { data, error } = await supabase.from('products').insert(payload).select('id').single();
      if (error) setError(error.message);
      else {
        await logAuditEvent('PRODUCT_CREATED', 'product', data?.id ?? null, `Produit créé : ${form.name}`, null, payload);
        onSaved();
      }
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200 sticky top-0 bg-white z-10">
          <h2 className="font-display text-lg font-bold text-sand-900">{product ? 'Modifier le produit' : 'Nouveau produit'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Code produit *</label><input className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="P0001" /></div>
            <div><label className="label">Statut</label><select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProductStatus })}><option value="ACTIVE">Actif</option><option value="INACTIVE">Inactif</option><option value="OUT_OF_STOCK">Rupture</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-4"><div><label className="label">Nom du produit *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div><label className="label">Marque</label><input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Ex: Samsung" /></div></div>
          <div><label className="label">Description</label><textarea className="input min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Catégorie</label><select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="label">Fournisseur</label><select className="input" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}><option value="">—</option>{suppliers.filter((s) => s.status === 'APPROVED' && !s.deleted_at).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Prix initial fournisseur</label><input type="number" min="0" className="input" value={form.initial_supplier_price} onChange={(e) => setForm({ ...form, initial_supplier_price: parseInt(e.target.value) || 0 })} /></div>
            <div><label className="label">Prix d'achat CMGS</label><input type="number" min="0" className="input" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: parseInt(e.target.value) || 0, supplier_price: parseInt(e.target.value) || 0 })} /></div>
            <div><label className="label">Prix de vente (FCFA)</label><input type="number" className="input" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: parseInt(e.target.value) || 0 })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Stock déclaré</label><input type="number" className="input" value={form.stock_declared} onChange={(e) => setForm({ ...form, stock_declared: parseInt(e.target.value) || 0 })} /></div>
            <div><label className="label">Stock vérifié</label><input type="number" min="0" className="input" value={form.stock_verified} onChange={(e) => setForm({ ...form, stock_verified: Math.max(0, parseInt(e.target.value) || 0) })} /></div>
            <div><label className="label">Seuil stock faible</label><input type="number" min="0" className="input" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: Math.max(0, parseInt(e.target.value) || 0) })} /></div>
          </div>
          <div><label className="label">URL image</label><input className="input" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></div>

          <div className="grid grid-cols-2 gap-4 p-4 bg-sand-50 rounded-xl">
            <div><div className="text-xs text-sand-500">Marge commerciale</div><div className="font-bold text-green-700">{formatFCFA(form.sale_price - form.purchase_price)}</div></div>
            <div><div className="text-xs text-sand-500">Commission fournisseur (0,01%)</div><div className="font-bold text-ocre-700">{formatFCFA(commission)}</div></div>
          </div>

          {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-sand-200 sticky bottom-0 bg-white">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Sauvegarde...' : 'Sauvegarder'}</button>
        </div>
      </div>
    </div>
  );
}
