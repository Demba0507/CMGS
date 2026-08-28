import { useState, useEffect } from 'react';
import { Truck, MapPin, Phone, Package, AlertTriangle, Camera } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Delivery, Order, Driver, Customer, DeliveryFailure } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { DRIVER_STATUS_LABELS, DRIVER_STATUS_COLORS } from '@/lib/constants';
import { assignDelivery, updateDeliveryStatus, listDeliveryFailures, resolveDeliveryFailure } from '@/lib/deliveries';
import { useToast } from '@/lib/toast';

export default function DeliveriesPage() {
  const toast = useToast();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [failures, setFailures] = useState<DeliveryFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: d }, { data: o }, { data: dr }, { data: c }, fl] = await Promise.all([
      supabase.from('deliveries').select('*').order('assigned_at', { ascending: false }),
      supabase.from('orders').select('*'),
      supabase.from('drivers').select('*'),
      supabase.from('customers').select('*'),
      listDeliveryFailures().catch(() => []),
    ]);
    setDeliveries((d as Delivery[]) ?? []);
    setOrders((o as Order[]) ?? []);
    setDrivers((dr as Driver[]) ?? []);
    setCustomers((c as Customer[]) ?? []);
    setFailures(fl);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (delivery: Delivery, newStatus: string) => {
    if (busyId) return;
    setBusyId(delivery.id);
    try {
      await updateDeliveryStatus(delivery.id, newStatus);
      await load();
      toast.success('Livraison mise à jour.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusyId(null);
    }
  };

  const assign = async (order: Order, driverId: string) => {
    if (busyId) return;
    setBusyId(order.id);
    try {
      await assignDelivery(order.id, driverId);
      await load();
      toast.success('Livreur assigné.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'assigner.");
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (failureId: string, decision: 'RETRY' | 'RETURN' | 'CANCEL_ORDER') => {
    if (busyId) return;
    setBusyId(failureId);
    try {
      await resolveDeliveryFailure(failureId, decision);
      await load();
      toast.success('Décision enregistrée.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Décision impossible.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const deliveredOrderIds = new Set(deliveries.map((d) => d.order_id));
  const unassignedOrders = orders.filter((o) => !deliveredOrderIds.has(o.id) && o.status !== 'CANCELLED' && o.status !== 'DELIVERED');
  const pendingFailures = failures.filter((f) => !f.decision);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div><h2 className="font-display text-xl font-bold text-sand-900">{deliveries.length} livraisons</h2><p className="text-sm text-sand-500">Suivez les livraisons en cours</p></div>

      {pendingFailures.length > 0 && (
        <div className="card p-4 bg-red-50 border-red-200">
          <h3 className="font-semibold text-sand-900 mb-3 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-600" /> Échecs de livraison en attente de décision ({pendingFailures.length})</h3>
          <div className="space-y-2">
            {pendingFailures.map((f) => {
              const delivery = deliveries.find((d) => d.id === f.delivery_id);
              const order = orders.find((o) => o.id === delivery?.order_id);
              return (
                <div key={f.id} className="bg-white rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm font-medium text-sand-900">{order?.code ?? '—'}</span>
                    <span className="text-xs text-sand-400">{formatDateTime(f.reported_at)}</span>
                  </div>
                  <p className="text-sm text-sand-700 mb-1">{f.reason}</p>
                  {f.comment && <p className="text-xs text-sand-500 mb-2">{f.comment}</p>}
                  <div className="flex gap-1.5">
                    <button onClick={() => void decide(f.id, 'RETRY')} disabled={!!busyId} className="text-xs px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50">{busyId === f.id ? '...' : 'Réessayer'}</button>
                    <button onClick={() => void decide(f.id, 'RETURN')} disabled={!!busyId} className="text-xs px-2.5 py-1 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50">Retourner à CMGS</button>
                    <button onClick={() => void decide(f.id, 'CANCEL_ORDER')} disabled={!!busyId} className="text-xs px-2.5 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50">Annuler la commande</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {unassignedOrders.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold text-sand-900 mb-3 text-sm">Commandes à assigner ({unassignedOrders.length})</h3>
          <div className="space-y-2">
            {unassignedOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between p-2.5 rounded-lg bg-sand-50 text-sm">
                <span className="font-mono font-medium text-sand-900">{o.code}</span>
                <select className="input max-w-[220px] py-1.5" defaultValue="" disabled={busyId === o.id} onChange={(e) => e.target.value && void assign(o, e.target.value)}>
                  <option value="" disabled>{busyId === o.id ? 'Assignation...' : 'Assigner un livreur...'}</option>
                  {drivers.filter((dr) => !dr.deleted_at).map((dr) => <option key={dr.id} value={dr.id}>{dr.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {deliveries.map((d) => {
          const order = orders.find((o) => o.id === d.order_id);
          const driver = drivers.find((dr) => dr.id === d.driver_id);
          const customer = customers.find((c) => c.id === order?.customer_id);
          return (
            <div key={d.id} className="card p-5 hover:shadow-card-hover transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Truck className="w-5 h-5 text-indigo-700" /></div>
                  <div>
                    <div className="font-mono font-medium text-sand-900">{order?.code ?? '—'}</div>
                    <div className="text-xs text-sand-400">{formatDateTime(d.assigned_at)}</div>
                  </div>
                </div>
                <span className={`badge ${DRIVER_STATUS_COLORS[d.status] ?? 'bg-sand-200 text-sand-600'}`}>{DRIVER_STATUS_LABELS[d.status] ?? d.status}</span>
              </div>
              <div className="space-y-1.5 text-sm text-sand-600 mb-3">
                <div className="flex items-center gap-2"><Package className="w-4 h-4 text-sand-400" /> {customer?.name ?? '—'}</div>
                {customer?.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-sand-400" /> {customer.phone}</div>}
                <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-sand-400" /> {order?.delivery_neighborhood ?? customer?.neighborhood ?? '—'}</div>
                <div className="flex items-center gap-2"><Truck className="w-4 h-4 text-sand-400" /> {driver?.name ?? 'Non assigné'}</div>
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-sand-100 pt-3">
                {d.status !== 'DELIVERED' && d.status !== 'FAILED' && d.status !== 'RETURNED' && (
                  <>
                    {d.status === 'ASSIGNED' && <button onClick={() => void updateStatus(d, 'PICKED_UP')} disabled={!!busyId} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50">{busyId === d.id ? '...' : 'Récupéré'}</button>}
                    {d.status === 'PICKED_UP' && <button onClick={() => void updateStatus(d, 'IN_TRANSIT')} disabled={!!busyId} className="text-xs px-3 py-1.5 rounded-lg bg-cyan-100 text-cyan-700 hover:bg-cyan-200 disabled:opacity-50">{busyId === d.id ? '...' : 'En route'}</button>}
                    {d.status === 'IN_TRANSIT' && <button onClick={() => void updateStatus(d, 'DELIVERED')} disabled={!!busyId} className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 flex items-center gap-1 disabled:opacity-50">{busyId === d.id ? '...' : (<><Camera className="w-3.5 h-3.5" /> Livré</>)}</button>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
