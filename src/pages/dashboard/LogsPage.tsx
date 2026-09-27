import { useState, useEffect, useMemo } from 'react';
import { ScrollText, Search, User, Trash2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { deleteAuditLogEntry, purgeAuditLogsBefore } from '@/lib/logs';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';
import { usePermissions } from '@/lib/permissions';
import type { EventLog } from '@/lib/types';
import { formatDateTime } from '@/lib/format';

const PAGE_SIZE = 200;

export default function LogsPage() {
  const { confirmAction } = useConfirm();
  const toast = useToast();
  const { has } = usePermissions();
  const canManage = has('settings.manage');

  const [logs, setLogs] = useState<EventLog[]>([]);
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purgeDate, setPurgeDate] = useState('');
  const [showPurge, setShowPurge] = useState(false);

  const load = async (currentLimit: number) => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('list_audit_logs', { p_limit: currentLimit });
    if (rpcError) {
      setError(friendlyError(rpcError, 'Impossible de charger le journal des activités.'));
      setLogs([]);
    } else {
      setLogs((data as EventLog[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { void load(limit); }, [limit]);

  const eventTypes = useMemo(() => [...new Set(logs.map((l) => l.event_type))].sort(), [logs]);

  const filtered = logs.filter((l) => {
    if (eventType && l.event_type !== eventType) return false;
    if (dateFrom && l.created_at.slice(0, 10) < dateFrom) return false;
    if (dateTo && l.created_at.slice(0, 10) > dateTo) return false;
    if (search) {
      const haystack = `${l.event_type} ${l.description ?? ''} ${l.actor_name ?? ''} ${l.actor_email ?? ''}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const handleDelete = (log: EventLog) => {
    confirmAction({
      title: 'Supprimer cette entrée du journal ?',
      message: `« ${log.event_type} » du ${formatDateTime(log.created_at)} sera effacée définitivement. Cette action elle-même sera journalisée.`,
      danger: true,
      confirmLabel: 'Supprimer',
      successMessage: 'Entrée supprimée.',
      onConfirm: async () => {
        await deleteAuditLogEntry(log.id);
        await load(limit);
      },
    });
  };

  const handlePurge = () => {
    if (!purgeDate) return;
    confirmAction({
      title: 'Purger les anciennes entrées ?',
      message: `Toutes les entrées antérieures au ${purgeDate} seront supprimées définitivement. Cette action est irréversible et sera elle-même journalisée.`,
      danger: true,
      confirmLabel: 'Purger',
      onConfirm: async () => {
        const count = await purgeAuditLogsBefore(new Date(purgeDate).toISOString());
        setShowPurge(false);
        setPurgeDate('');
        await load(limit);
        toast.success(`${count} entrée(s) supprimée(s).`);
      },
    });
  };

  if (loading && logs.length === 0) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const eventColors: Record<string, string> = {
    ORDER_CREATED: 'text-green-600',
    ORDER_STATUS_CHANGED: 'text-blue-600',
    PAYMENT_VERIFIED: 'text-green-600',
    STOCK_UPDATED: 'text-ocre-600',
    AUDIT_LOG_ENTRY_DELETED: 'text-red-600',
    AUDIT_LOG_PURGED: 'text-red-600',
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-sand-900 dark:text-sand-100">Journal des activités</h2>
          <p className="text-sm text-sand-500 dark:text-sand-400">{filtered.length} entrée{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''} — qui a fait quoi, et quand</p>
        </div>
        {canManage && (
          <button onClick={() => setShowPurge((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100">
            <ShieldAlert className="w-3.5 h-3.5" /> Purger les anciennes entrées
          </button>
        )}
      </div>

      {showPurge && canManage && (
        <div className="card p-4 flex flex-wrap items-end gap-3 bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
          <div>
            <label className="label">Supprimer tout ce qui est antérieur au</label>
            <input type="date" className="input" value={purgeDate} onChange={(e) => setPurgeDate(e.target.value)} max={new Date(Date.now() - 86400000).toISOString().slice(0, 10)} />
          </div>
          <button onClick={handlePurge} disabled={!purgeDate} className="btn-primary bg-red-600 hover:bg-red-700 disabled:opacity-50">Purger définitivement</button>
          <button onClick={() => setShowPurge(false)} className="btn-secondary">Annuler</button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400" />
          <input className="input pl-10" placeholder="Rechercher par action, élément ou auteur..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input max-w-[220px]" value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="">Tous les types d'action</option>
          {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" className="input max-w-[160px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Depuis le" />
        <input type="date" className="input max-w-[160px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Jusqu'au" />
      </div>

      {error && <div className="card p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">{error}</div>}

      {!error && (
        <div className="card overflow-hidden">
          <div className="text-xs">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sand-400 dark:text-sand-500">Aucun événement trouvé</div>
            ) : (
              <div className="divide-y divide-sand-100 dark:divide-sand-700">
                {filtered.map((l) => (
                  <div key={l.id} className="flex items-start gap-3 p-3 hover:bg-sand-50 dark:hover:bg-sand-700 transition-colors group">
                    <ScrollText className="w-4 h-4 text-sand-300 dark:text-sand-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap font-mono">
                        <span className={`font-medium ${eventColors[l.event_type] ?? 'text-sand-700 dark:text-sand-300'}`}>{l.event_type}</span>
                        <span className="text-sand-400 dark:text-sand-500 text-[10px]">{formatDateTime(l.created_at)}</span>
                      </div>
                      {l.description && <div className="text-sand-600 dark:text-sand-300 mt-0.5">{l.description}</div>}
                      <div className="flex items-center gap-1 mt-1 text-sand-400 dark:text-sand-500">
                        <User className="w-3 h-3" />
                        <span>{l.actor_name || l.actor_email || 'Système'}</span>
                      </div>
                    </div>
                    {canManage && (
                      <button onClick={() => handleDelete(l)} className="w-7 h-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="Supprimer cette entrée">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {logs.length >= limit && !error && (
        <div className="flex justify-center">
          <button onClick={() => setLimit((l) => l + PAGE_SIZE)} disabled={loading} className="btn-secondary text-sm">{loading ? 'Chargement...' : 'Charger plus d\u2019entrées'}</button>
        </div>
      )}
    </div>
  );
}
