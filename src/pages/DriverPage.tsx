import { useState, useEffect, useCallback } from 'react';
import { Truck, MapPin, Phone, Package, LogOut, Camera, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { updateDeliveryStatus, recordDeliveryProof, reportDeliveryFailure, driverConfirmCashPayment } from '@/lib/deliveries';
import type { Delivery, Order, Customer, Payment } from '@/lib/types';
import { formatDateTime, formatFCFA } from '@/lib/format';
import { DRIVER_STATUS_LABELS, DRIVER_STATUS_COLORS, PAYMENT_METHOD_LABELS } from '@/lib/constants';

export default function DriverPage({ onBack }: { onBack: () => void }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: d }, { data: o }, { data: c }, { data: p }] = await Promise.all([
      supabase.from('deliveries').select('*').order('assigned_at', { ascending: false }),
      supabase.from('orders').select('*'),
      supabase.from('customers').select('*'),
      supabase.from('payments').select('*'),
    ]);
    setDeliveries((d as Delivery[]) ?? []);
    setOrders((o as Order[]) ?? []);
    setCustomers((c as Customer[]) ?? []);
    setPayments((p as Payment[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const logout = async () => {
    await supabase.auth.signOut();
    onBack();
  };

  const activeDeliveries = deliveries.filter((d) => d.status !== 'DELIVERED' && d.status !== 'RETURNED');
  const doneDeliveries = deliveries.filter((d) => d.status === 'DELIVERED' || d.status === 'RETURNED');

  return (
    <div className="min-h-screen bg-sand-50">
      <header className="bg-white border-b border-sand-200 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2"><Truck className="w-5 h-5 text-ocre-600" /><h1 className="font-display font-bold text-sand-900">Mes livraisons</h1></div>
        <button onClick={() => void logout()} className="p-2 rounded-lg hover:bg-sand-100 text-sand-600" title="Se déconnecter"><LogOut className="w-4 h-4" /></button>
      </header>

      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-sand-700">En cours ({activeDeliveries.length})</h2>
            {activeDeliveries.length === 0 && <div className="card p-6 text-center text-sand-400 text-sm">Aucune livraison en cours.</div>}
            {activeDeliveries.map((d) => (
              <DeliveryCard
                key={d.id}
                delivery={d}
                order={orders.find((o) => o.id === d.order_id) ?? null}
                customer={customers.find((c) => c.id === orders.find((o) => o.id === d.order_id)?.customer_id) ?? null}
                payment={payments.find((p) => p.order_id === d.order_id) ?? null}
                onChanged={load}
              />
            ))}

            {doneDeliveries.length > 0 && (
              <>
                <h2 className="text-sm font-semibold text-sand-700 pt-2">Terminées ({doneDeliveries.length})</h2>
                {doneDeliveries.map((d) => (
                  <div key={d.id} className="card p-4 flex items-center justify-between opacity-70">
                    <span className="text-sm text-sand-600">{orders.find((o) => o.id === d.order_id)?.code ?? '—'}</span>
                    <span className={`badge ${DRIVER_STATUS_COLORS[d.status]}`}>{DRIVER_STATUS_LABELS[d.status]}</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DeliveryCard({ delivery, order, customer, payment, onChanged }: { delivery: Delivery; order: Order | null; customer: Customer | null; payment: Payment | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [showFailureForm, setShowFailureForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const advance = async (status: string) => {
    setBusy(true);
    setError(null);
    try {
      await updateDeliveryStatus(delivery.id, status);
      if (status === 'DELIVERED') {
        await recordDeliveryProof(delivery.id, 'CONFIRMATION');
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  const confirmPayment = async () => {
    setBusy(true);
    setError(null);
    try {
      await driverConfirmCashPayment(delivery.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Package className="w-5 h-5 text-indigo-700" /></div>
          <div>
            <div className="font-mono font-medium text-sand-900">{order?.code ?? '—'}</div>
            <div className="text-xs text-sand-400">{formatDateTime(delivery.assigned_at)}</div>
          </div>
        </div>
        <span className={`badge ${DRIVER_STATUS_COLORS[delivery.status]}`}>{DRIVER_STATUS_LABELS[delivery.status]}</span>
      </div>

      <div className="space-y-1.5 text-sm text-sand-600 mb-3">
        <div className="flex items-center gap-2"><Package className="w-4 h-4 text-sand-400" /> {customer?.name ?? '—'}</div>
        {customer?.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-sand-400" /> {customer.phone}</div>}
        <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-sand-400" /> {order?.delivery_neighborhood ?? customer?.neighborhood ?? '—'}</div>
        {order && <div className="font-semibold text-sand-900">{formatFCFA(order.total)} — {payment ? PAYMENT_METHOD_LABELS[payment.method] : ''}</div>}
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {delivery.status === 'DELIVERED' && payment?.method === 'CASH_ON_DELIVERY' && payment.status === 'PENDING' && (
        <button onClick={() => void confirmPayment()} disabled={busy} className="w-full mb-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">
          <CheckCircle2 className="w-4 h-4" /> Confirmer paiement reçu
        </button>
      )}

      {delivery.status !== 'FAILED' && delivery.status !== 'DELIVERED' && !showFailureForm && (
        <div className="flex flex-wrap gap-1.5 border-t border-sand-100 pt-3">
          {delivery.status === 'ASSIGNED' && <button disabled={busy} onClick={() => void advance('PICKED_UP')} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200">Récupéré</button>}
          {delivery.status === 'PICKED_UP' && <button disabled={busy} onClick={() => void advance('IN_TRANSIT')} className="text-xs px-3 py-1.5 rounded-lg bg-cyan-100 text-cyan-700 hover:bg-cyan-200">En route</button>}
          {delivery.status === 'IN_TRANSIT' && (
            <button disabled={busy} onClick={() => void advance('DELIVERED')} className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 flex items-center gap-1">
              <Camera className="w-3.5 h-3.5" /> Confirmer la livraison
            </button>
          )}
          <button disabled={busy} onClick={() => setShowFailureForm(true)} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Signaler un échec
          </button>
        </div>
      )}

      {showFailureForm && (
        <FailureForm
          onCancel={() => setShowFailureForm(false)}
          onSubmit={async (reason, comment) => {
            setBusy(true);
            setError(null);
            try {
              await reportDeliveryFailure(delivery.id, reason, comment);
              setShowFailureForm(false);
              onChanged();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Impossible de signaler.');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

const FAILURE_REASONS = ['Client injoignable', 'Adresse introuvable', 'Client absent', 'Refus de livraison', 'Autre'];

function FailureForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (reason: string, comment?: string) => void }) {
  const [reason, setReason] = useState(FAILURE_REASONS[0]);
  const [comment, setComment] = useState('');
  return (
    <div className="mt-3 pt-3 border-t border-sand-100 space-y-2">
      <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
        {FAILURE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <input className="input" placeholder="Commentaire (facultatif)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-lg border border-sand-200 text-sand-600 text-xs font-medium">Annuler</button>
        <button onClick={() => onSubmit(reason, comment || undefined)} className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700">Confirmer l'échec</button>
      </div>
    </div>
  );
}
