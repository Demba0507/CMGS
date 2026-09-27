import { useState, useEffect } from 'react';
import { Plus, Bike, Phone, MapPin, Edit2, Trash2, X, ArchiveRestore, ShieldAlert, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { deleteDriver, restoreDriver, purgeDriver } from '@/lib/drivers';
import { friendlyError } from '@/lib/errors';
import { usePermissions } from '@/lib/permissions';
import { logAuditEvent } from '@/lib/audit';
import TrashActionsBar from '@/components/TrashActionsBar';
import type { Driver, Delivery, DriverStatus } from '@/lib/types';
import { DRIVER_STATUS_LABELS, DRIVER_STATUS_COLORS } from '@/lib/constants';

export default function DriversPage() {
  const { confirmAction } = useConfirm();
  const toast = useToast();
  const { has } = usePermissions();
  const canDelete = has('drivers.delete');
  const canManage = has('deliveries.assign');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editDriver, setEditDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTrash, setShowTrash] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
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

  const visibleDrivers = drivers.filter((d) => {
    if (showTrash ? !d.deleted_at : !!d.deleted_at) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !(d.phone ?? '').includes(search)) return false;
    if (!showTrash && filterStatus && d.status !== filterStatus) return false;
    return true;
  });
  const trashCount = drivers.filter((d) => !!d.deleted_at).length;

  const allSelected = visibleDrivers.length > 0 && visibleDrivers.every((d) => selectedIds.has(d.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(visibleDrivers.map((d) => d.id)));
  const toggleOne = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const purgeMany = (ids: string[]) => {
    if (ids.length === 0 || bulkBusy) return;
    confirmAction({
      title: ids.length === 1 ? 'Supprimer définitivement ce livreur ?' : `Supprimer définitivement ${ids.length} livreurs ?`,
      message: 'Cette action est irréversible : ils seront effacés de façon permanente et ne pourront plus être restaurés.',
      danger: true,
      confirmLabel: 'Supprimer définitivement',
      successMessage: ids.length === 1 ? 'Livreur supprimé définitivement.' : `${ids.length} livreurs supprimés définitivement.`,
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          for (const id of ids) await purgeDriver(id);
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
        <div><h2 className="font-display text-xl font-bold text-sand-900 dark:text-sand-100">{visibleDrivers.length} livreurs</h2><p className="text-sm text-sand-500 dark:text-sand-400">Gérez votre équipe de livraison</p></div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button onClick={() => { setShowTrash((v) => !v); setSelectedIds(new Set()); }} className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 ${showTrash ? 'bg-ocre-600 text-white' : 'bg-sand-100 text-sand-600 hover:bg-sand-200'}`}>
              <Trash2 className="w-3.5 h-3.5" /> {showTrash ? 'Retour aux livreurs' : `Corbeille${trashCount > 0 ? ` (${trashCount})` : ''}`}
            </button>
          )}
          {!showTrash && canManage && <button onClick={() => { setEditDriver(null); setShowForm(true); }} className="btn-primary"><Plus className="w-4 h-4" /> Ajouter</button>}
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

      {showTrash && (
        <TrashActionsBar
          count={visibleDrivers.length}
          selectedCount={selectedIds.size}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onDeleteSelected={() => purgeMany([...selectedIds])}
          onEmptyTrash={() => purgeMany(visibleDrivers.map((d) => d.id))}
          busy={bulkBusy}
        />
      )}

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
                    {showTrash && (
                      <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleOne(d.id)} className="rounded shrink-0" />
                    )}
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center"><Bike className="w-6 h-6 text-indigo-700" /></div>
                    <div><h3 className="font-semibold text-sand-900 dark:text-sand-100">{d.name}</h3><span className="font-mono text-xs text-sand-400">{d.code}</span></div>
                  </div>
                  <span className={`badge ${DRIVER_STATUS_COLORS[d.status]}`}>{DRIVER_STATUS_LABELS[d.status]}</span>
                </div>
                <div className="space-y-1.5 text-sm text-sand-600 mb-3">
                  {d.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-sand-400" /> {d.phone}</div>}
                  {d.zone && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-sand-400" /> {d.zone}</div>}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-sand-100 pt-3 mb-3">
                  <div className="text-center"><div className="font-bold text-sand-900 dark:text-sand-100">{activeDeliveries}</div><div className="text-xs text-sand-500 dark:text-sand-400">En cours</div></div>
                  <div className="text-center"><div className="font-bold text-green-700">{totalDelivered}</div><div className="text-xs text-sand-500 dark:text-sand-400">Livrées</div></div>
                </div>
                <div className="flex justify-end gap-1">
                  {showTrash ? (
                    <>
                      <button onClick={() => handleRestore(d)} className="w-8 h-8 rounded-lg hover:bg-green-50 flex items-center justify-center text-green-600" title="Restaurer"><ArchiveRestore className="w-4 h-4" /></button>
                      <button onClick={() => purgeMany([d.id])} className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center text-red-500 dark:text-red-400" title="Supprimer définitivement"><ShieldAlert className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      {canManage && <button onClick={() => { setEditDriver(d); setShowForm(true); }} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center text-sand-600 dark:text-sand-300"><Edit2 className="w-4 h-4" /></button>}
                      <button onClick={() => handleDelete(d)} className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center text-red-500 dark:text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <DriverForm driver={editDriver} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); toast.success('Livreur enregistré avec succès.'); }} />}
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
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!form.name.trim()) { setError('Le nom du livreur est requis.'); return; }
    if (!form.code.trim()) { setError('Le code livreur est requis.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (driver) {
        const { error: err } = await supabase.from('drivers').update(form).eq('id', driver.id);
        if (err) throw err;
        await logAuditEvent('DRIVER_UPDATED', 'driver', driver.id, `Livreur modifié : ${form.name}`, driver, form);
      } else {
        const { data, error: err } = await supabase.from('drivers').insert(form).select('id').single();
        if (err) throw err;
        await logAuditEvent('DRIVER_CREATED', 'driver', data?.id ?? null, `Livreur créé : ${form.name}`, null, form);
      }
      onSaved();
    } catch (err) {
      setError(friendlyError(err, "Impossible d'enregistrer ce livreur — vérifiez que le code n'est pas déjà utilisé."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-sand-800 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200 dark:border-sand-700"><h2 className="font-display text-lg font-bold text-sand-900 dark:text-sand-50">{driver ? 'Modifier' : 'Nouveau'} livreur</h2><button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center"><X className="w-5 h-5" /></button></div>
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
        <div className="p-5">
          {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3 bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-sand-200 dark:border-sand-700"><button onClick={onClose} className="btn-secondary">Annuler</button><button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Sauvegarde...' : 'Sauvegarder'}</button></div>
      </div>
    </div>
  );
}
