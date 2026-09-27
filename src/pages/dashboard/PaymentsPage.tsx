import { useState, useEffect } from 'react';
import { CreditCard, Check, X, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import type { Payment, Order, Customer } from '@/lib/types';
import { formatFCFA, formatDateTime } from '@/lib/format';
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { usePermissions } from '@/lib/permissions';

export default function PaymentsPage() {
  const { has } = usePermissions();
  const canProcess = has('payments.validate') || has('payments.refund');
  const toast = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: o }, { data: c }] = await Promise.all([
      supabase.from('payments').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*'),
      supabase.from('customers').select('*'),
    ]);
    setPayments((p as Payment[]) ?? []);
    setOrders((o as Order[]) ?? []);
    setCustomers((c as Customer[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    if (busyId) return;
    setBusyId(id);
    const update: { status: string; verified_at?: string } = { status };
    if (status === 'VERIFIED') update.verified_at = new Date().toISOString();
    // Ne traite que si le paiement est encore PENDING : évite qu'un double-clic ou
    // qu'une action concurrente de deux employés ne traite deux fois le même paiement
    // sans avertir personne (§28 fiabilité) — même principe que driver_confirm_cash_payment.
    const { data, error } = await supabase.from('payments').update(update).eq('id', id).eq('status', 'PENDING').select('id');
    if (error) {
      toast.error('Une erreur est survenue. Veuillez réessayer.');
    } else if (!data || data.length === 0) {
      toast.error('Ce paiement a déjà été traité entre-temps.');
    } else {
      toast.success(status === 'VERIFIED' ? 'Paiement vérifié.' : 'Paiement rejeté.');
    }
    await load();
    setBusyId(null);
  };

  const filtered = payments.filter((p) => {
    const order = orders.find((o) => o.id === p.order_id);
    if (search && !(order?.code ?? '').toLowerCase().includes(search.toLowerCase()) && !(p.reference ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    return true;
  });

  const totalVerified = payments.filter((p) => p.status === 'VERIFIED').reduce((s, p) => s + p.amount, 0);
  const totalPending = payments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + p.amount, 0);

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card"><div className="flex items-center gap-2 mb-2"><CreditCard className="w-5 h-5 text-ocre-600" /><span className="text-sm text-sand-500 dark:text-sand-400">Total vérifié</span></div><div className="font-display text-xl font-bold text-green-700">{formatFCFA(totalVerified)}</div></div>
        <div className="stat-card"><div className="flex items-center gap-2 mb-2"><CreditCard className="w-5 h-5 text-ocre-600" /><span className="text-sm text-sand-500 dark:text-sand-400">En attente</span></div><div className="font-display text-xl font-bold text-ocre-700">{formatFCFA(totalPending)}</div></div>
        <div className="stat-card"><div className="flex items-center gap-2 mb-2"><CreditCard className="w-5 h-5 text-ocre-600" /><span className="text-sm text-sand-500 dark:text-sand-400">Total paiements</span></div><div className="font-display text-xl font-bold text-sand-900 dark:text-sand-100">{payments.length}</div></div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400" />
          <input className="input pl-10" placeholder="Rechercher par commande ou référence..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input max-w-[180px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand-50 dark:bg-sand-900/50 border-b border-sand-200 dark:border-sand-700">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Commande</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300 hidden md:table-cell">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Méthode</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300 hidden lg:table-cell">Référence</th>
                  <th className="text-right px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Montant</th>
                  <th className="text-center px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Statut</th>
                  <th className="text-right px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100 dark:divide-sand-700">
                {filtered.map((p) => {
                  const order = orders.find((o) => o.id === p.order_id);
                  const customer = customers.find((c) => c.id === order?.customer_id);
                  return (
                    <tr key={p.id} className="hover:bg-sand-50 dark:hover:bg-sand-700 transition-colors">
                      <td className="px-4 py-3"><div className="font-mono font-medium text-sand-900 dark:text-sand-100">{order?.code ?? '—'}</div><div className="text-xs text-sand-400">{formatDateTime(p.created_at)}</div></td>
                      <td className="px-4 py-3 hidden md:table-cell text-sand-700">{customer?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sand-600">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
                      <td className="px-4 py-3 hidden lg:table-cell font-mono text-sand-600">{p.reference ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-sand-900 dark:text-sand-100">{formatFCFA(p.amount)}</td>
                      <td className="px-4 py-3 text-center"><span className={`badge ${PAYMENT_STATUS_COLORS[p.status]}`}>{PAYMENT_STATUS_LABELS[p.status]}</span></td>
                      <td className="px-4 py-3 text-right">
                        {p.status === 'PENDING' && canProcess && (
                          <div className="flex items-center justify-end gap-1">
                            {busyId === p.id ? (
                              <div className="w-4 h-4 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin mr-1" />
                            ) : (
                              <>
                                <button onClick={() => void updateStatus(p.id, 'VERIFIED')} disabled={!!busyId} className="w-8 h-8 rounded-lg hover:bg-green-50 flex items-center justify-center text-green-600 disabled:opacity-50" title="Vérifier"><Check className="w-4 h-4" /></button>
                                <button onClick={() => void updateStatus(p.id, 'REJECTED')} disabled={!!busyId} className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center text-red-500 dark:text-red-400 disabled:opacity-50" title="Rejeter"><X className="w-4 h-4" /></button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
