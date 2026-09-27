import { useState, useEffect } from 'react';
import { Search, Phone, MapPin, MessageSquare, ShoppingCart, X, ChevronRight, Trash2, ArchiveRestore, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { deleteCustomer, restoreCustomer, purgeCustomer } from '@/lib/customers';
import { usePermissions } from '@/lib/permissions';
import { useConfirm } from '@/lib/confirm';
import type { Customer, Order, Conversation, Message } from '@/lib/types';
import { formatFCFA, formatDateTime, timeAgo } from '@/lib/format';
import { CUSTOMER_STATUS_LABELS, CUSTOMER_STATUS_COLORS, CHANNEL_LABELS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/constants';
import ExportButtons from '@/components/ExportButtons';
import TrashActionsBar from '@/components/TrashActionsBar';
import type { ExportColumn } from '@/lib/export';

const customerExportColumns: ExportColumn<Customer>[] = [
  { label: 'Nom', value: (c) => c.name },
  { label: 'Téléphone', value: (c) => c.phone ?? '—' },
  { label: 'Quartier', value: (c) => c.neighborhood ?? '—' },
  { label: 'Canal', value: (c) => CHANNEL_LABELS[c.channel] ?? c.channel },
  { label: 'Statut', value: (c) => CUSTOMER_STATUS_LABELS[c.status] ?? c.status },
  { label: 'Créé le', value: (c) => formatDateTime(c.created_at) },
];

export default function CustomersPage() {
  const { has } = usePermissions();
  const { confirmAction } = useConfirm();
  const canDelete = has('customers.delete');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [listLimit, setListLimit] = useState(200);
  const [hasMore, setHasMore] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: o }, { data: conv }] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(listLimit),
      supabase.from('orders').select('*'),
      supabase.from('conversations').select('*'),
    ]);
    setCustomers((c as Customer[]) ?? []);
    setHasMore((c?.length ?? 0) === listLimit);
    setOrders((o as Order[]) ?? []);
    setConversations((conv as Conversation[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [listLimit]);

  const visibleCustomers = customers.filter((c) => (showTrash ? !!c.deleted_at : !c.deleted_at));
  const trashCount = customers.filter((c) => !!c.deleted_at).length;

  const filtered = visibleCustomers.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !(c.phone ?? '').includes(search)) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    return true;
  });

  const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(filtered.map((c) => c.id)));
  const toggleOne = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const purgeMany = (ids: string[]) => {
    if (ids.length === 0 || bulkBusy) return;
    confirmAction({
      title: ids.length === 1 ? 'Supprimer définitivement ce client ?' : `Supprimer définitivement ${ids.length} clients ?`,
      message: 'Cette action est irréversible : ces clients seront effacés de façon permanente et ne pourront plus être restaurés.',
      danger: true,
      confirmLabel: 'Supprimer définitivement',
      successMessage: ids.length === 1 ? 'Client supprimé définitivement.' : `${ids.length} clients supprimés définitivement.`,
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          for (const id of ids) await purgeCustomer(id);
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
        <div><h2 className="font-display text-xl font-bold text-sand-900 dark:text-sand-100">{visibleCustomers.length} clients</h2><p className="text-sm text-sand-500 dark:text-sand-400">Gérez vos clients et prospects</p></div>
        <div className="flex items-center gap-2">
          <ExportButtons filename="clients-ratelafrica" title="Clients RATELAFRICA" columns={customerExportColumns} rows={filtered} />
          {canDelete && (
            <button onClick={() => { setShowTrash((v) => !v); setSelected(null); setSelectedIds(new Set()); }} className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 ${showTrash ? 'bg-ocre-600 text-white' : 'bg-sand-100 text-sand-600 hover:bg-sand-200'}`}>
              <Trash2 className="w-3.5 h-3.5" /> {showTrash ? 'Retour aux clients' : `Corbeille${trashCount > 0 ? ` (${trashCount})` : ''}`}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400" />
          <input className="input pl-10" placeholder="Rechercher par nom ou téléphone..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input max-w-[180px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          {Object.entries(CUSTOMER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {showTrash && (
        <TrashActionsBar
          count={filtered.length}
          selectedCount={selectedIds.size}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onDeleteSelected={() => purgeMany([...selectedIds])}
          onEmptyTrash={() => purgeMany(filtered.map((c) => c.id))}
          busy={bulkBusy}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand-50 dark:bg-sand-900/50 border-b border-sand-200 dark:border-sand-700">
                <tr>
                  {showTrash && <th className="w-10 px-4 py-3"></th>}
                  <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Nom</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300 hidden md:table-cell">Téléphone</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300 hidden lg:table-cell">Quartier</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 dark:text-sand-300 hidden lg:table-cell">Canal</th>
                  <th className="text-center px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Commandes</th>
                  <th className="text-center px-4 py-3 font-medium text-sand-600 dark:text-sand-300">Statut</th>
                  <th className="text-right px-4 py-3 font-medium text-sand-600 dark:text-sand-300"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100 dark:divide-sand-700">
                {filtered.map((c) => {
                  const custOrders = orders.filter((o) => o.customer_id === c.id);
                  return (
                    <tr key={c.id} className="hover:bg-sand-50 dark:hover:bg-sand-700 transition-colors cursor-pointer" onClick={() => setSelected(c)}>
                      {showTrash && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleOne(c.id)} className="rounded" />
                        </td>
                      )}
                      <td className="px-4 py-3"><div className="font-medium text-sand-900 dark:text-sand-100">{c.name}</div><div className="text-xs text-sand-400">Inscrit {timeAgo(c.created_at)}</div></td>
                      <td className="px-4 py-3 hidden md:table-cell text-sand-700">{c.phone ?? '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-sand-600">{c.neighborhood ?? '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell"><span className="badge bg-sand-100 text-sand-600">{CHANNEL_LABELS[c.channel] ?? c.channel}</span></td>
                      <td className="px-4 py-3 text-center text-sand-700 font-medium">{custOrders.length}</td>
                      <td className="px-4 py-3 text-center"><span className={`badge ${CUSTOMER_STATUS_COLORS[c.status]}`}>{CUSTOMER_STATUS_LABELS[c.status]}</span></td>
                      <td className="px-4 py-3 text-right"><ChevronRight className="w-4 h-4 text-sand-400 inline" /></td>
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
          <button onClick={() => setListLimit((l) => l + 200)} disabled={loading} className="btn-secondary text-sm">{loading ? 'Chargement...' : 'Charger plus de clients'}</button>
        </div>
      )}

      {selected && (
        <CustomerDetail
          customer={selected}
          orders={orders.filter((o) => o.customer_id === selected.id)}
          conversations={conversations.filter((cv) => cv.customer_id === selected.id)}
          onClose={() => setSelected(null)}
          onDeleted={() => { setSelected(null); void load(); }}
        />
      )}
    </div>
  );
}

function CustomerDetail({ customer, orders, conversations, onClose, onDeleted }: { customer: Customer; orders: Order[]; conversations: Conversation[]; onClose: () => void; onDeleted: () => void }) {
  const { has } = usePermissions();
  const { confirmAction } = useConfirm();
  const canDelete = has('customers.delete');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsg, setLoadingMsg] = useState(true);
  const isTrashed = !!customer.deleted_at;

  const handleDelete = () => {
    confirmAction({
      title: 'Supprimer ce client ?',
      message: `« ${customer.name} » sera déplacé en corbeille et n'apparaîtra plus dans la liste des clients. Il pourra être restauré depuis la corbeille.`,
      danger: true,
      confirmLabel: 'Supprimer',
      successMessage: 'Client déplacé en corbeille.',
      onConfirm: async () => {
        await deleteCustomer(customer.id);
        onDeleted();
      },
    });
  };

  const handleRestore = () => {
    confirmAction({
      title: 'Restaurer ce client ?',
      message: `« ${customer.name} » redeviendra visible dans la liste des clients.`,
      confirmLabel: 'Restaurer',
      successMessage: 'Client restauré avec succès.',
      onConfirm: async () => {
        await restoreCustomer(customer.id);
        onDeleted();
      },
    });
  };

  const handlePurge = () => {
    confirmAction({
      title: 'Supprimer définitivement ce client ?',
      message: `« ${customer.name} » sera effacé de façon permanente et ne pourra plus être restauré.`,
      danger: true,
      confirmLabel: 'Supprimer définitivement',
      successMessage: 'Client supprimé définitivement.',
      onConfirm: async () => {
        await purgeCustomer(customer.id);
        onDeleted();
      },
    });
  };

  useEffect(() => {
    (async () => {
      if (conversations.length === 0) { setLoadingMsg(false); return; }
      const { data } = await supabase.from('messages').select('*').in('conversation_id', conversations.map((c) => c.id)).order('created_at', { ascending: true });
      setMessages((data as Message[]) ?? []);
      setLoadingMsg(false);
    })();
  }, [conversations]);

  const totalSpent = orders.filter((o) => o.status === 'DELIVERED').reduce((s, o) => s + o.total, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-sand-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200 dark:border-sand-700 sticky top-0 bg-white dark:bg-sand-800 z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold">{customer.name.charAt(0)}</div>
            <div><h2 className="font-display text-lg font-bold text-sand-900 dark:text-sand-50">{customer.name}</h2><span className={`badge ${CUSTOMER_STATUS_COLORS[customer.status]}`}>{CUSTOMER_STATUS_LABELS[customer.status]}</span></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 dark:hover:bg-sand-700 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="card p-3"><div className="text-sand-500 text-xs">Téléphone</div><div className="font-medium text-sand-900 flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone ?? '—'}</div></div>
            <div className="card p-3"><div className="text-sand-500 text-xs">Quartier</div><div className="font-medium text-sand-900 flex items-center gap-1"><MapPin className="w-3 h-3" />{customer.neighborhood ?? '—'}</div></div>
            <div className="card p-3"><div className="text-sand-500 text-xs">Canal d'origine</div><div className="font-medium text-sand-900 dark:text-sand-100">{CHANNEL_LABELS[customer.channel]}</div></div>
            <div className="card p-3"><div className="text-sand-500 text-xs">Total dépensé</div><div className="font-bold text-ocre-700">{formatFCFA(totalSpent)}</div></div>
          </div>

          <div>
            <h3 className="font-semibold text-sand-900 mb-2 text-sm flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Commandes ({orders.length})</h3>
            {orders.length === 0 ? <p className="text-sm text-sand-400">Aucune commande</p> : (
              <div className="space-y-1.5">
                {orders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between p-2.5 rounded-lg bg-sand-50 dark:bg-sand-800">
                    <div><span className="font-mono text-sm font-medium">{o.code}</span><span className="text-xs text-sand-400 ml-2">{formatDateTime(o.created_at)}</span></div>
                    <div className="flex items-center gap-2"><span className={`badge ${ORDER_STATUS_COLORS[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span><span className="font-bold text-sm">{formatFCFA(o.total)}</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-sand-900 mb-2 text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Conversations ({conversations.length})</h3>
            {loadingMsg ? <p className="text-sm text-sand-400">Chargement...</p> : messages.length === 0 ? <p className="text-sm text-sand-400">Aucune conversation</p> : (
              <div className="card p-4 max-h-64 overflow-y-auto space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === 'CUSTOMER' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${m.sender === 'CUSTOMER' ? 'bg-indigo-600 text-white' : 'bg-sand-100 text-sand-800'}`}>{m.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canDelete && (
            <div className="border-t border-sand-200 dark:border-sand-700 pt-4 space-y-2">
              {isTrashed ? (
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleRestore} className="flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-800">
                    <ArchiveRestore className="w-4 h-4" /> Restaurer ce client
                  </button>
                  <button onClick={handlePurge} className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700">
                    <ShieldAlert className="w-4 h-4" /> Supprimer définitivement
                  </button>
                </div>
              ) : (
                <button onClick={handleDelete} className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700">
                  <Trash2 className="w-4 h-4" /> Supprimer ce client
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
