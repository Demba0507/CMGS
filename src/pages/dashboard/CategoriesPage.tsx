import { useState, useEffect } from 'react';
import { Plus, Layers, Edit2, Trash2, X, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/lib/confirm';
import { logAuditEvent } from '@/lib/audit';
import type { Category, Product } from '@/lib/types';

export default function CategoriesPage() {
  const { confirmAction } = useConfirm();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('products').select('*'),
    ]);
    setCategories((c as Category[]) ?? []);
    setProducts((p as Product[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = (cat: Category) => {
    confirmAction({
      title: 'Supprimer cette catégorie ?',
      message: `« ${cat.name} » sera définitivement supprimée. Cette action est irréversible.`,
      danger: true,
      confirmLabel: 'Supprimer',
      successMessage: 'Catégorie supprimée avec succès.',
      onConfirm: async () => {
        const { error } = await supabase.from('categories').delete().eq('id', cat.id);
        if (error) throw new Error('Impossible de supprimer cette catégorie.');
        await logAuditEvent('CATEGORY_DELETED', 'category', cat.id, `Catégorie supprimée : ${cat.name}`, cat, null);
        await load();
      },
    });
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-xl font-bold text-sand-900">{categories.length} catégories</h2><p className="text-sm text-sand-500">Organisez votre catalogue</p></div>
        <button onClick={() => { setEditCat(null); setShowForm(true); }} className="btn-primary"><Plus className="w-4 h-4" /> Ajouter</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((c) => {
            const count = products.filter((p) => p.category_id === c.id).length;
            return (
              <div key={c.id} className="card p-5 hover:shadow-card-hover transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-ocre-100 to-ocre-200 flex items-center justify-center"><Layers className="w-6 h-6 text-ocre-700" /></div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditCat(c); setShowForm(true); }} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center text-sand-600"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(c)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <h3 className="font-semibold text-sand-900">{c.name}</h3>
                <div className="flex items-center gap-2 mt-2 text-sm text-sand-500"><Package className="w-4 h-4" /> {count} produit{count > 1 ? 's' : ''}</div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <CategoryForm category={editCat} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}

function CategoryForm({ category, onClose, onSaved }: { category: Category | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name) return;
    setSaving(true);
    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-');
    if (category) {
      await supabase.from('categories').update({ name, slug }).eq('id', category.id);
      await logAuditEvent('CATEGORY_UPDATED', 'category', category.id, `Catégorie modifiée : ${name}`, category.name, name);
    } else {
      const { data } = await supabase.from('categories').insert({ name, slug }).select('id').single();
      await logAuditEvent('CATEGORY_CREATED', 'category', data?.id ?? null, `Catégorie créée : ${name}`, null, name);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200"><h2 className="font-display text-lg font-bold text-sand-900">{category ? 'Modifier' : 'Nouvelle'} catégorie</h2><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center"><X className="w-5 h-5" /></button></div>
        <div className="p-5"><label className="label">Nom *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Électronique" /></div>
        <div className="flex justify-end gap-2 p-5 border-t border-sand-200"><button onClick={onClose} className="btn-secondary">Annuler</button><button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Sauvegarde...' : 'Sauvegarder'}</button></div>
      </div>
    </div>
  );
}
