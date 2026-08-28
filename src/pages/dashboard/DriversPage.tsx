import { useState, useEffect } from 'react';
import { Plus, Bike, Phone, MapPin, Edit2, Trash2, X, ArchiveRestore, ShieldAlert, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { deleteDriver, restoreDriver, purgeDriver } from '@/lib/drivers';
import { usePermissions } from '@/lib/permissions';
import { logAuditEvent } from '@/lib/audit';
import ConfirmPasswordModal from '@/components/ConfirmPasswordModal';
import type { Driver, Delivery, DriverStatus } from '@/lib/types';
import { DRIVER_STATUS_LABELS, DRIVER_STATUS_COLORS } from '@/lib/constants';

export default function DriversPage() {
  const { confirmAction } = useConfirm();
  const toast = useToast();
  const { has } = usePermissions();
  const canDelete = has('drivers.delete');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editDriver, setEditDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState<Driver | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = async () => {
    setLoading(true);
    const [{ data: d }, { data: del }] = await Promise.all([
      supabase.from('drivers').select('*').order('created_at', { ascending: false }),
      supabase.from('deliveries').select('*'),
    ]);
    setDrivers((d as Driver[]) ?? []);
    setDeliveries((del as Delivery[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = (driver: Driver) => {
    confirmAction({
      title: 'Supprimer ce livreur ?',
      message: `« ${driver.name} » sera déplacé en corbeille. Il pourra être restauré si besoin.`,
      danger: true,
      confirmLabel: 'Supprimer',
      successMessage: 'Livreur déplacé en corbeille.',
      onConfirm: async () => {
        await deleteDriver(driver.id);
        await load();
      },
    });
  };

  const handleRestore = (driver: Driver) => {
    confirmAction({
      title: 'Restaurer ce livreur ?',
      message: `« ${driver.name} » redeviendra visible dans la liste des livreurs.`,
      confirmLabel: 'Restaurer',
      successMessage: 'Livreur restauré avec succès.',
      onConfirm: async () => {
        await restoreDriver(driver.id);
        await load();
      },
    });
  };

  const handlePurge = async () => {
    if (!confirmPurge) return;
    setPurgeError(null);
    try {
      await purgeDriver(confirmPurge.id);
      setConfirmPurge(null);
      await load();
      toast.success('Livreur supprimé définitivement.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Suppression définitive impossible.';
      setPurgeError(message);
      toast.error(message);
      setConfirmPurge(null);
    }
  };

  const visibleDrivers = drivers.filter((d) => {
    if (showTrash ? !d.deleted_at : !!d.deleted_at) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !(d.phone ?? '').includes(search)) return false;
    if (!showTrash && filterStatus && d.status !== filterStatus) return false;
    return true;
  });
  const trashCount = drivers.filter((d) => !!d.deleted_at).length;

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-xl font-bold text-sand-900">{visibleDrivers.length} livreurs</h2><p className="text-sm text-sand-500">Gérez votre équipe de livraison</p></div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button onClick={() => setShowTrash((v) => !v)} className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 ${showTrash ? 'bg-ocre-600 text-white' : 'bg-sand-100 text-sand-600 hover:bg-sand-200'}`}>
              <Trash2 className="w-3.5 h-3.5" /> {showTrash ? 'Retour aux livreurs' : `Corbeille${trashCount > 0 ? ` (${trashCount})` : ''}`}
            </button>
          )}
          {!showTrash && <button onClick={() => { setEditDriver(null); setShowForm(true); }} className="btn-primary"><Plus className="w-4 h-4" /> Ajouter</button>}
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
            {Object.entries(DRIVER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      )}

      {purgeError && <div className="card p-3 bg-red-50 border-red-200 text-sm text-red-700">{purgeError}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : visibleDrivers.length === 0 ? (
        <div className="card p-12 text-center text-sand-400">{showTrash ? 'La corbeille est vide.' : 'Aucun livreur ne correspond à ces critères.'}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleDrivers.map((d) => {
            const activeDeliveries = deliveries.filter((del) => del.driver_id === d.id && del.status !== 'DELIVERED' && del.status !== 'FAILED').length;
            const totalDelivered = deliveries.filter((del) => del.driver_id === d.id && del.status === 'DELIVERED').length;
            return (
              <div key={d.id} className="card p-5 hover:shadow-card-hover transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center"><Bike className="w-6 h-6 text-indigo-700" /></div>
                    <div><h3 className="font-semibold text-sand-900">{d.name}</h3><span className="font-mono text-xs text-sand-400">{d.code}</span></div>
                  </div>
                  <span className={`badge ${DRIVER_STATUS_COLORS[d.status]}`}>{DRIVER_STATUS_LABELS[d.status]}</span>
                </div>
                <div className="space-y-1.5 text-sm text-sand-600 mb-3">
                  {d.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-sand-400" /> {d.phone}</div>}
                  {d.zone && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-sand-400" /> {d.zone}</div>}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-sand-100 pt-3 mb-3">
                  <div className="text-center"><div className="font-bold text-sand-900">{activeDeliveries}</div><div className="text-xs text-sand-500">En cours</div></div>
                  <div className="text-center"><div className="font-bold text-green-700">{totalDelivered}</div><div className="text-xs text-sand-500">Livrées</div></div>
                </div>
                <div className="flex justify-end gap-1">
                  {showTrash ? (
                    <>
                      <button onClick={() => handleRestore(d)} className="w-8 h-8 rounded-lg hover:bg-green-50 flex items-center justify-center text-green-600" title="Restaurer"><ArchiveRestore className="w-4 h-4" /></button>
                      <button onClick={() => setConfirmPurge(d)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-500" title="Supprimer définitivement"><ShieldAlert className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditDriver(d); setShowForm(true); }} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center text-sand-600"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(d)} className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <DriverForm driver={editDriver} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); toast.success('Livreur enregistré avec succès.'); }} />}
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

function DriverForm({ driver, onClose, onSaved }: { driver: Driver | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: driver?.code ?? `L${String(Date.now()).slice(-4)}`,
    name: driver?.name ?? '',
    phone: driver?.phone ?? '',
    zone: driver?.zone ?? '',
    status: driver?.status ?? 'AVAILABLE',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name || !form.code) return;
    setSaving(true);
    if (driver) {
      await supabase.from('drivers').update(form).eq('id', driver.id);
      await logAuditEvent('DRIVER_UPDATED', 'driver', driver.id, `Livreur modifié : ${form.name}`, driver, form);
    } else {
      const { data } = await supabase.from('drivers').insert(form).select('id').single();
      await logAuditEvent('DRIVER_CREATED', 'driver', data?.id ?? null, `Livreur créé : ${form.name}`, null, form);
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200"><h2 className="font-display text-lg font-bold text-sand-900">{driver ? 'Modifier' : 'Nouveau'} livreur</h2><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center"><X className="w-5 h-5" /></button></div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Code *</label><input className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><label className="label">Statut</label><select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DriverStatus })}>{Object.entries(DRIVER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <div><label className="label">Nom *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Téléphone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">Zone</label><input className="input" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-sand-200"><button onClick={onClose} className="btn-secondary">Annuler</button><button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Sauvegarde...' : 'Sauvegarder'}</button></div>
      </div>
    </div>
  );
}
