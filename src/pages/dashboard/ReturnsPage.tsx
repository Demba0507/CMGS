import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, AlertCircle, Truck } from 'lucide-react';
import { listReturns, resolveReturn, RETURN_REASON_LABELS } from '@/lib/returns';
import { useConfirm } from '@/lib/confirm';
import type { Return } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { RETURN_STATUS_LABELS, RETURN_STATUS_COLORS } from '@/lib/constants';
import { usePermissions } from '@/lib/permissions';

export default function ReturnsPage() {
  const canResolve = usePermissions().has('orders.edit');
  const { confirmAction } = useConfirm();
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setReturns(await listReturns());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = filterStatus ? returns.filter((r) => r.status === filterStatus) : returns;

  const RESOLVE_LABELS: Record<'APPROVED' | 'REJECTED' | 'COMPLETED', { title: string; confirmLabel: string; danger?: boolean }> = {
    APPROVED: { title: 'Approuver ce retour ?', confirmLabel: 'Approuver' },
    REJECTED: { title: 'Rejeter ce retour ?', confirmLabel: 'Rejeter', danger: true },
    COMPLETED: { title: 'Marquer ce retour comme terminé ?', confirmLabel: 'Marquer terminé' },
  };

  const resolve = (r: Return, status: 'APPROVED' | 'REJECTED' | 'COMPLETED') => {
    if (busyId) return;
    const meta = RESOLVE_LABELS[status];
    confirmAction({
      title: meta.title,
      message: status === 'COMPLETED' ? 'Le stock du produit sera automatiquement réapprovisionné.' : 'Vous pouvez ajouter une note optionnelle expliquant votre décision.',
      confirmLabel: meta.confirmLabel,
      danger: meta.danger,
      successMessage: 'Retour mis à jour.',
      input: { label: 'Note de résolution', placeholder: 'Facultatif' },
      onConfirm: async (resolution) => {
        setBusyId(r.id);
        try {
          await resolveReturn(r.id, status, resolution || undefined);
          void load();
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (loadError) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="card p-5 flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-sand-900 dark:text-sand-100">{returns.length} retours</h2>
          <p className="text-sm text-sand-500 dark:text-sand-400">Retours produits demandés par les clients</p>
        </div>
        <select className="input max-w-[200px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          {Object.entries(RETURN_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-sand-400 text-sm">Aucun retour pour le moment.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-sand-400" />
                  <span className="font-medium text-sand-900 text-sm">{RETURN_REASON_LABELS[r.reason_category]}</span>
                  {r.route_to_supplier && <span className="badge bg-indigo-100 text-indigo-700 flex items-center gap-1"><Truck className="w-3 h-3" /> Retour fournisseur</span>}
                </div>
                <span className={`badge ${RETURN_STATUS_COLORS[r.status]}`}>{RETURN_STATUS_LABELS[r.status]}</span>
              </div>
              {r.comment && <p className="text-sm text-sand-600 mb-2">{r.comment}</p>}
              {r.resolution && <p className="text-xs text-sand-400 italic mb-2">Résolution : {r.resolution}</p>}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs text-sand-400">{formatDateTime(r.created_at)}</span>
                {r.status === 'REQUESTED' && canResolve && (
                  <div className="flex gap-1.5">
                    <button onClick={() => void resolve(r, 'APPROVED')} disabled={!!busyId} className="text-xs px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50">{busyId === r.id ? '...' : 'Approuver'}</button>
                    <button onClick={() => void resolve(r, 'REJECTED')} disabled={!!busyId} className="text-xs px-2.5 py-1 rounded-lg bg-red-100 text-red-700 dark:text-red-400 hover:bg-red-200 disabled:opacity-50">Rejeter</button>
                  </div>
                )}
                {r.status === 'APPROVED' && canResolve && (
                  <button onClick={() => void resolve(r, 'COMPLETED')} disabled={!!busyId} className="text-xs px-2.5 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">{busyId === r.id ? '...' : 'Marquer terminé (restocke)'}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
