import { useState, useEffect } from 'react';
import { ChevronRight, X, Package, Truck, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Order, OrderItem, Customer, Supplier, OrderSupplierGroup } from '@/lib/types';
import { formatFCFA, formatDateTime } from '@/lib/format';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_STATUS_FLOW, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, CHANNEL_LABELS, SUBORDER_STATUS_LABELS, SUBORDER_STATUS_COLORS, SUBORDER_STATUS_FLOW } from '@/lib/constants';
import { updateSuborderStatus } from '@/lib/suborders';
import { logAuditEvent } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import ExportButtons from '@/components/ExportButtons';
import type { ExportColumn } from '@/lib/export';

function orderExportColumns(customers: Customer[]): ExportColumn<Order>[] {
  return [
    { label: 'Code', value: (o) => o.code },
    { label: 'Client', value: (o) => customers.find((c) => c.id === o.customer_id)?.name ?? '—' },
    { label: 'Téléphone', value: (o) => customers.find((c) => c.id === o.customer_id)?.phone ?? '—' },
    { label: 'Canal', value: (o) => CHANNEL_LABELS[o.channel] ?? o.channel },
    { label: 'Statut', value: (o) => ORDER_STATUS_LABELS[o.status] ?? o.status },
    { label: 'Paiement', value: (o) => PAYMENT_METHOD_LABELS[o.payment_method] ?? o.payment_method },
    { label: 'Sous-total', value: (o) => o.subtotal },
    { label: 'Livraison', value: (o) => o.delivery_fee },
    { label: 'Total', value: (o) => o.total },
    { label: 'Date', value: (o) => formatDateTime(o.created_at) },
  ];
}

import { cancelOrder } from '@/lib/orderActions';

export default function OrdersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [suborders, setSuborders] = useState<Record<string, OrderSupplierGroup[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: o }, { data: c }, { data: allItems }, { data: s }, { data: allSuborders }] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('*'),
      supabase.from('order_items').select('*'),
      supabase.from('suppliers').select('*'),
      supabase.from('order_supplier_groups').select('*'),
    ]);
    const allOrders = (o as Order[]) ?? [];
    setOrders(allOrders);
    setCustomers((c as Customer[]) ?? []);
    setSuppliers((s as Supplier[]) ?? []);
    const itemMap: Record<string, OrderItem[]> = {};
    (allItems as OrderItem[])?.forEach((i) => {
      if (!itemMap[i.order_id]) itemMap[i.order_id] = [];
      itemMap[i.order_id].push(i);
    });
    setItems(itemMap);
    const suborderMap: Record<string, OrderSupplierGroup[]> = {};
    (allSuborders as OrderSupplierGroup[])?.forEach((g) => {
      if (!suborderMap[g.order_id]) suborderMap[g.order_id] = [];
      suborderMap[g.order_id].push(g);
    });
    setSuborders(suborderMap);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = orders.filter((o) => {
    if (filterStatus && o.status !== filterStatus) return false;
    if (search) {
      const cust = customers.find((c) => c.id === o.customer_id);
      const haystack = `${o.code} ${cust?.name ?? ''} ${cust?.phone ?? ''}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const updateStatus = async (order: Order, newStatus: string) => {
    if (statusBusyId) return;
    setStatusBusyId(order.id);
    if (newStatus === 'CANCELLED') {
      const reason = prompt("Motif de l'annulation (facultatif) :") ?? undefined;
      try {
        await cancelOrder(order.id, reason);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Impossible d'annuler cette commande.";
        toast.error(message);
        setStatusBusyId(null);
        return;
      }
      await load();
      toast.success(`Commande ${order.code} annulée.`);
      setStatusBusyId(null);
      if (selectedOrder?.id === order.id) setSelectedOrder(null);
      return;
    }
    const { error } = await supabase.from('orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', order.id);
    if (error) {
      toast.error('Une erreur est survenue. Veuillez réessayer.');
      setStatusBusyId(null);
      return;
    }
    await logAuditEvent('ORDER_STATUS_CHANGED', 'order', order.id, `Commande ${order.code} → ${ORDER_STATUS_LABELS[newStatus]}`, order.status, newStatus);
    if (newStatus === 'DELIVERED') {
      await supabase.from('payments').update({ status: 'VERIFIED', verified_at: new Date().toISOString() }).eq('order_id', order.id).eq('status', 'PENDING');
    }
    await load();
    toast.success(`Commande ${order.code} → ${ORDER_STATUS_LABELS[newStatus]}.`);
    setStatusBusyId(null);
    if (selectedOrder?.id === order.id) {
      setSelectedOrder({ ...order, status: newStatus as Order['status'] });
    }
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="font-display text-xl font-bold text-sand-900">{orders.length} commandes</h2><p className="text-sm text-sand-500">Gérez et suivez vos commandes</p></div>
        <div className="flex items-center gap-2">
          <ExportButtons
            filename="commandes-cmgs"
            title="Commandes CMGS"
            columns={orderExportColumns(customers)}
            rows={filtered}
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400" />
            <input className="input pl-10 max-w-[220px]" placeholder="Code, client, téléphone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input max-w-[200px]" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Tous statuts</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand-50 border-b border-sand-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-sand-600">Commande</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 hidden md:table-cell">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 hidden lg:table-cell">Canal</th>
                  <th className="text-left px-4 py-3 font-medium text-sand-600 hidden lg:table-cell">Paiement</th>
                  <th className="text-right px-4 py-3 font-medium text-sand-600">Total</th>
                  <th className="text-center px-4 py-3 font-medium text-sand-600">Statut</th>
                  <th className="text-right px-4 py-3 font-medium text-sand-600">Détail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {filtered.map((o) => {
                  const cust = customers.find((c) => c.id === o.customer_id);
                  return (
                    <tr key={o.id} className="hover:bg-sand-50 transition-colors cursor-pointer" onClick={() => setSelectedOrder(o)}>
                      <td className="px-4 py-3"><div className="font-mono font-medium text-sand-900">{o.code}</div><div className="text-xs text-sand-400">{formatDateTime(o.created_at)}</div></td>
                      <td className="px-4 py-3 hidden md:table-cell text-sand-700">{cust?.name ?? '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell"><span className="badge bg-sand-100 text-sand-600">{CHANNEL_LABELS[o.channel] ?? o.channel}</span></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><span className={`badge ${PAYMENT_STATUS_COLORS[o.payment_status]}`}>{PAYMENT_STATUS_LABELS[o.payment_status]}</span></td>
                      <td className="px-4 py-3 text-right font-bold text-sand-900">{formatFCFA(o.total)}</td>
                      <td className="px-4 py-3 text-center"><span className={`badge ${ORDER_STATUS_COLORS[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span></td>
                      <td className="px-4 py-3 text-right"><ChevronRight className="w-4 h-4 text-sand-400 inline" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          items={items[selectedOrder.id] ?? []}
          suborders={suborders[selectedOrder.id] ?? []}
          suppliers={suppliers}
          customer={customers.find((c) => c.id === selectedOrder.customer_id) ?? null}
          onClose={() => setSelectedOrder(null)}
          onUpdateStatus={updateStatus}
          onReload={load}
          statusBusy={!!statusBusyId}
        />
      )}
    </div>
  );
}

function OrderDetail({
  order, items, suborders, suppliers, customer, onClose, onUpdateStatus, onReload, statusBusy,
}: {
  order: Order; items: OrderItem[]; suborders: OrderSupplierGroup[]; suppliers: Supplier[]; customer: Customer | null;
  onClose: () => void; onUpdateStatus: (o: Order, s: string) => void; onReload: () => void; statusBusy: boolean;
}) {
  const nextStatuses = ORDER_STATUS_FLOW[order.status] ?? [];
  const itemsBySupplierGroup: Record<string, OrderItem[]> = {};
  for (const item of items) {
    const key = item.supplier_group_id ?? 'none';
    (itemsBySupplierGroup[key] ??= []).push(item);
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-sand-200 sticky top-0 bg-white z-10">
          <div><h2 className="font-display text-lg font-bold text-sand-900 font-mono">{order.code}</h2><p className="text-sm text-sand-500">{formatDateTime(order.created_at)}</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-sand-100 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`badge ${ORDER_STATUS_COLORS[order.status]} text-sm px-3 py-1`}>{ORDER_STATUS_LABELS[order.status]}</span>
            <span className={`badge ${PAYMENT_STATUS_COLORS[order.payment_status]}`}>{PAYMENT_METHOD_LABELS[order.payment_method]} — {PAYMENT_STATUS_LABELS[order.payment_status]}</span>
            <span className="badge bg-sand-100 text-sand-600">{CHANNEL_LABELS[order.channel]}</span>
          </div>

          {customer && (
            <div className="card p-4">
              <h3 className="font-semibold text-sand-900 mb-3 text-sm">Client</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-sand-500">Nom</span><div className="font-medium text-sand-900">{customer.name}</div></div>
                <div><span className="text-sand-500">Téléphone</span><div className="font-medium text-sand-900">{customer.phone ?? '—'}</div></div>
                <div><span className="text-sand-500">Quartier</span><div className="font-medium text-sand-900">{order.delivery_neighborhood ?? customer.neighborhood ?? '—'}</div></div>
                <div><span className="text-sand-500">Adresse</span><div className="font-medium text-sand-900">{order.delivery_address ?? customer.address ?? '—'}</div></div>
              </div>
            </div>
          )}

          {suborders.length > 1 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-sand-900 text-sm">Sous-commandes fournisseurs ({suborders.length})</h3>
              {suborders.map((g) => (
                <SuborderCard
                  key={g.id}
                  group={g}
                  supplierName={suppliers.find((s) => s.id === g.supplier_id)?.name ?? 'Fournisseur inconnu'}
                  items={itemsBySupplierGroup[g.id] ?? []}
                  onChanged={onReload}
                />
              ))}
            </div>
          )}

          <div className="card p-4">
            <h3 className="font-semibold text-sand-900 mb-3 text-sm">Articles ({items.length})</h3>
            <div className="space-y-2">
              {items.map((i) => (
                <div key={i.id} className="flex items-center justify-between py-2 border-b border-sand-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-sand-400" />
                    <div><div className="font-medium text-sand-900 text-sm">{i.product_name}</div><div className="font-mono text-xs text-sand-400">{i.product_code} ×{i.quantity}</div></div>
                  </div>
                  <div className="text-right"><div className="font-bold text-sand-900 text-sm">{formatFCFA(i.unit_price * i.quantity)}</div><div className="text-xs text-sand-400">{formatFCFA(i.unit_price)} / unité</div></div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-sand-200 space-y-1 text-sm">
              <div className="flex justify-between text-sand-600"><span>Sous-total</span><span>{formatFCFA(order.subtotal)}</span></div>
              <div className="flex justify-between text-sand-600"><span>Livraison</span><span>{formatFCFA(order.delivery_fee)}</span></div>
              {order.service_fee > 0 && <div className="flex justify-between text-sand-600"><span>Frais de service</span><span>{formatFCFA(order.service_fee)}</span></div>}
              <div className="flex justify-between font-bold text-sand-900 text-base pt-2 border-t border-sand-200"><span>Total</span><span>{formatFCFA(order.total)}</span></div>
            </div>
          </div>

          {nextStatuses.length > 0 && (
            <div className="card p-4 bg-ocre-50 border-ocre-200">
              <h3 className="font-semibold text-sand-900 mb-3 text-sm">Changer le statut</h3>
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((s) => (
                  <button key={s} onClick={() => onUpdateStatus(order, s)} disabled={statusBusy} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${s === 'CANCELLED' || s === 'RETURNED' || s === 'REFUNDED' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-ocre-600 text-white hover:bg-ocre-700'}`}>
                    {statusBusy ? '...' : ORDER_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SuborderCard({ group, supplierName, items, onChanged }: { group: OrderSupplierGroup; supplierName: string; items: OrderItem[]; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const nextStatuses = SUBORDER_STATUS_FLOW[group.status] ?? [];

  const changeStatus = async (status: string) => {
    setBusy(true);
    try {
      await updateSuborderStatus(group.id, status);
      onChanged();
      toast.success(`Sous-commande ${supplierName} → ${SUBORDER_STATUS_LABELS[status] ?? status}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de modifier la sous-commande.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-sand-400" />
          <span className="font-medium text-sand-900 text-sm">{supplierName}</span>
          <span className="text-xs text-sand-400">{group.item_count} article(s) · {formatFCFA(group.subtotal)}</span>
        </div>
        <span className={`badge ${SUBORDER_STATUS_COLORS[group.status]}`}>{SUBORDER_STATUS_LABELS[group.status]}</span>
      </div>
      <div className="space-y-1 mb-2">
        {items.map((i) => (
          <div key={i.id} className="flex justify-between text-xs text-sand-600">
            <span>{i.quantity} × {i.product_name}</span>
          </div>
        ))}
      </div>
      {nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-sand-100">
          {nextStatuses.map((s) => (
            <button
              key={s}
              disabled={busy}
              onClick={() => void changeStatus(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium ${s === 'CANCELLED' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-sand-100 text-sand-700 hover:bg-sand-200'}`}
            >
              {SUBORDER_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

