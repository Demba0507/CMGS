import { useState, useEffect } from 'react';
import { Plus, Store, Edit2, Trash2, X, Phone, MapPin, Star, Check, XCircle, ArchiveRestore, ShieldAlert, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { deleteSupplier, restoreSupplier, purgeSupplier } from '@/lib/suppliers';
import { usePermissions } from '@/lib/permissions';
import { logAuditEvent } from '@/lib/audit';
import ConfirmPasswordModal from '@/components/ConfirmPasswordModal';
import type { Supplier, Product, SupplierStatus } from '@/lib/types';
import { SUPPLIER_STATUS_LABELS, SUPPLIER_STATUS_COLORS } from '@/lib/constants';

export default function SuppliersPage() {
  const { confirmAction } = useConfirm();
  const toast = useToast();
  const { has } = usePermissions();
  const canDelete = has('suppliers.delete');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editSup, setEditSup] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState<Supplier | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from('suppliers').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('*'),
    ]);
    setSuppliers((s as Supplier[]) ?? []);
    setProducts((p as Product[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    const supplier = suppliers.find((s) => s.id === id);
    await supabase.from('suppliers').update({ status }).eq('id', id);
    await logAuditEvent('SUPPLIER_STATUS_CHANGED', 'supplier', id, `Fournisseur ${supplier?.name ?? ''} → ${SUPPLIER_STATUS_LABELS[status as SupplierStatus] ?? status}`, supplier?.status, status);
    toast.success('Statut du fournisseur mis à jour.');
    load();
  };

  const handleDelete = (supplier: Supplier) => {
    confirmAction({
      title: 'Supprimer ce fournisseur ?',
      message: `« ${supplier.name} » sera déplacé en corbeille. Il pourra être restauré si besoin.`,
      danger: true,
      confirmLabel: 'Supprimer',
      successMessage: 'Fournisseur déplacé en corbeille.',
      onConfirm: async () => {
        await deleteSupplier(supplier.id);
        await load();
      },
    });
  };

  const handleRestore = (supplier: Supplier) => {
    confirmAction({
      title: 'Restaurer ce fournisseur ?',
      message: `« ${supplier.name} » redeviendra visible dans la liste des fournisseurs.`,
      confirmLabel: 'Restaurer',
      successMessage: 'Fournisseur restauré avec succès.',
      onConfirm: async () => {
        await restoreSupplier(supplier.id);
        await load();
      },
    });
  };

  const handlePurge = async () => {
    if (!confirmPurge) return;
    const supplier = confirmPurge;
    setPurgeError(null);
    try {
      await purgeSupplier(supplier.id);
      setConfirmPurge(null);
      await load();
      toast.success('Fournisseur supprimé définitivement.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Suppression définitive impossible.';
      setPurgeError(message);
      toast.error(message);
      setConfirmPurge(null);
    }
  };

  const visibleSuppliers = suppliers.filter((s) => {
    if (showTrash ? !s.deleted_at : !!s.deleted_at) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !(s.phone ?? '').includes(search)) return false;
    if (!showTrash && filterStatus && s.status !== filterStatus) return false;
    return true;
  });
  const trashCount = suppliers.filter((s) => !!s.deleted_at).length;

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-xl font-bold text-sand-900">{visibleSuppliers.length} fournisseurs</h2><p className="text-sm text-sand-500">Gérez votre réseau de grossistes</p></div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button onClick={() => setShowTrash((v) => !v)} className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 ${showTrash ? 'bg-ocre-600 text-white' : 'bg-sand-100 text-sand-600 hover:bg-sand-200'}`}>
              <Trash2 className="w-3.5 h-3.5" /> {showTrash ? 'Retour aux fournisseurs' : `Corbeille${trashCount > 0 ? ` (${trashCount})` : ''}`}
            </button>
          )}
          {!showTrash && <button onClick={() => { setEditSup(null); setShowForm(true); }} className="btn-primary"><Plus className="w-4 h-4" /> Ajouter</button>}
        </div>
      </div>

      {!showTrash && (
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400" />
            <input className="input pl-10" placeholder="Rechercher par nom ou téléphone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input max-w-[180px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Tous statuts</option>
            {Object.entries(SUPPLIER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      )}

      {purgeError && <div className="card p-3 bg-red-50 border-red-200 text-sm text-red-700">{purgeError}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : visibleSuppliers.length === 0 ? (
        <div className="card p-12 text-center text-sand-400">{showTrash ? 'La corbeille est vide.' : 'Aucun fournisseur ne correspond à ces critères.'}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleSuppliers.map((s) => {
            const prodCount = products.filter((p) => p.supplier_id === s.id).length;
            return (
              <div key={s.id} className="card p-5 hover:shadow-card-hover transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center"><Store className="w-6 h-6 text-indigo-700" /></div>
                    <div>
                      <h3 className="font-semibold text-sand-900">{s.name}</h3>
                      <span className="font-mono text-xs text-sand-400">{s.code}</span>
                    </div>
                  </div>
                  <span className={`badge ${SUPPLIER_STATUS_COLORS[s.status]}`}>{SUPPLIER_STATUS_LABELS[s.status]}</span>
                </div>
                {s.business_name && <p className="text-sm text-sand-600 mb-2">{s.business_name}</p>}
                <div className="space-y-1.5 text-sm text-sand-600 mb-3">
                  {s.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-sand-400" /> {s.phone}</div>}
                  {s.zone && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-sand-400" /> {s.zone}</div>}
                  <div className="flex items-center gap-2">
                    <div className="flex">{[1,2,3,4,5].map((i) => <Star key={i} className={`w-4 h-4 ${i <= (s.quality_rating ?? 0) ? 'text-ocre-400 fill-ocre-400' : 'text-sand-200'}`} />)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-sand-100 pt-3">
                  <span className="text-sm text-sand-500">{prodCount} produit{prodCount > 1 ? 's' : ''}</span>
                  <div className="flex gap-1">
                    {showTrash ? (
                      <>
                        <button onClick={() => handleRestore(s)} className="w-8 h-8 rounded-lg hover:bg-green-50 flex items-center justify-center text-green-600" title="Restaurer"><ArchiveRestore className="w-4 h-4" /></button>
                        <button onClick={() => setConfirmPurge(s)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-500" title="Supprimer définitivement"><ShieldAlert className="w-4 h-4" /></button>
                      </>
                    ) : (
                      <>
                        {s.status === 'PENDING' && <button onClick={() => updateStatus(s.id, 'APPROVED')} className="w-8 h-8 rounded-lg hover:bg-green-50 flex items-center justify-center text-green-600" title="Approuver"><Check className="w-4 h-4" /></button>}
                        {s.status === 'APPROVED' && <button onClick={() => updateStatus(s.id, 'SUSPENDED')} className="w-8 h-8 rounded-lg hover:bg-orange-50 flex items-center justify-center text-orange-600" title="Suspendre"><XCircle className="w-4 h-4" /></button>}
                        <button onClick={() => { setEditSup(s); setShowForm(true); }} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center text-sand-600"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(s)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <SupplierForm supplier={editSup} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {confirmPurge && (
        <ConfirmPasswordModal
          title="Supprimer définitivement"
          description={`« ${confirmPurge.name} » sera effacé de façon permanente et ne pourra plus être restauré. Confirmez avec votre mot de passe.`}
          onCancel={() => setConfirmPurge(null)}
          onConfirmed={() => void handlePurge()}
        />
      )}
    </div>
  );
}

function SupplierForm({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: supplier?.code ?? `F${String(Date.now()).slice(-4)}`,
    name: supplier?.name ?? '',
    business_name: supplier?.business_name ?? '',
    phone: supplier?.phone ?? '',
    zone: supplier?.zone ?? '',
    contact_info: supplier?.contact_info ?? '',
    status: supplier?.status ?? 'APPROVED',
    quality_rating: supplier?.quality_rating ?? 3,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name || !form.code) return;
    setSaving(true);
    if (supplier) {
      await supabase.from('suppliers').update(form).eq('id', supplier.id);
      await logAuditEvent('SUPPLIER_UPDATED', 'supplier', supplier.id, `Fournisseur modifié : ${form.name}`, supplier, form);
    } else {
      const { data } = await supabase.from('suppliers').insert(form).select('id').single();
      await logAuditEvent('SUPPLIER_CREATED', 'supplier', data?.id ?? null, `Fournisseur créé : ${form.name}`, null, form);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200"><h2 className="font-display text-lg font-bold text-sand-900">{supplier ? 'Modifier' : 'Nouveau'} fournisseur</h2><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center"><X className="w-5 h-5" /></button></div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Code *</label><input className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><label className="label">Statut</label><select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SupplierStatus })}>{Object.entries(SUPPLIER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <div><label className="label">Nom *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Nom commercial</label><input className="input" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Téléphone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">Zone</label><input className="input" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} /></div>
          </div>
          <div><label className="label">Note qualité</label><div className="flex gap-1">{[1,2,3,4,5].map((i) => <button key={i} onClick={() => setForm({ ...form, quality_rating: i })}><Star className={`w-6 h-6 ${i <= form.quality_rating ? 'text-ocre-400 fill-ocre-400' : 'text-sand-200'}`} /></button>)}</div></div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-sand-200"><button onClick={onClose} className="btn-secondary">Annuler</button><button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Sauvegarde...' : 'Sauvegarder'}</button></div>
      </div>
    </div>
  );
}
