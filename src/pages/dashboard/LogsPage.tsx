import { useState, useEffect } from 'react';
import { ScrollText, Search, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { EventLog } from '@/lib/types';
import { formatDateTime } from '@/lib/format';

export default function LogsPage() {
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('list_audit_logs', { p_limit: 200 });
    if (rpcError) {
      setError(friendlyError(rpcError, 'Impossible de charger le journal des activités.'));
      setLogs([]);
    } else {
      setLogs((data as EventLog[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered = logs.filter((l) => {
    if (search) {
      const haystack = `${l.event_type} ${l.description ?? ''} ${l.actor_name ?? ''} ${l.actor_email ?? ''}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const eventColors: Record<string, string> = {
    ORDER_CREATED: 'text-green-600',
    ORDER_STATUS_CHANGED: 'text-blue-600',
    PAYMENT_VERIFIED: 'text-green-600',
    STOCK_UPDATED: 'text-ocre-600',
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div><h2 className="font-display text-xl font-bold text-sand-900">Journal des activités</h2><p className="text-sm text-sand-500">{logs.length} entrées — qui a fait quoi, et quand</p></div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400" />
        <input className="input pl-10" placeholder="Rechercher par action, élément ou auteur..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <div className="card p-4 bg-red-50 border-red-200 text-sm text-red-700">{error}</div>}

      {!error && (
        <div className="card overflow-hidden">
          <div className="text-xs">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sand-400">Aucun événement trouvé</div>
            ) : (
              <div className="divide-y divide-sand-100">
                {filtered.map((l) => (
                  <div key={l.id} className="flex items-start gap-3 p-3 hover:bg-sand-50 transition-colors">
                    <ScrollText className="w-4 h-4 text-sand-300 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap font-mono">
                        <span className={`font-medium ${eventColors[l.event_type] ?? 'text-sand-700'}`}>{l.event_type}</span>
                        <span className="text-sand-400 text-[10px]">{formatDateTime(l.created_at)}</span>
                      </div>
                      {l.description && <div className="text-sand-600 mt-0.5">{l.description}</div>}
                      <div className="flex items-center gap-1 mt-1 text-sand-400">
                        <User className="w-3 h-3" />
                        <span>{l.actor_name || l.actor_email || 'Système'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
