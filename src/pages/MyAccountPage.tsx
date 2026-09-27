import { useState, useEffect, useCallback } from 'react';
import { User, Package, CreditCard, Truck, MessageSquare, RotateCcw, LogOut, AlertCircle, Pencil, Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getMyCustomerProfile, updateMyCustomerProfile, getMyHistory, getMyNotifications, markMyNotificationRead, type MyHistory } from '@/lib/myAccount';
import { useTranslation } from '@/lib/i18n';
import { requestReturn, RETURN_REASON_LABELS } from '@/lib/returns';
import { createComplaint } from '@/lib/complaints';
import type { Customer, Return, OrderItem, CustomerNotification } from '@/lib/types';
import { formatFCFA, formatDateTime, timeAgo } from '@/lib/format';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, CHANNEL_LABELS, RETURN_STATUS_LABELS, RETURN_STATUS_COLORS } from '@/lib/constants';

const TABS = [
  { id: 'notifications', labelKey: 'account.notifications', icon: Bell },
  { id: 'orders', labelKey: 'account.orders', icon: Package },
  { id: 'payments', labelKey: 'account.payments', icon: CreditCard },
  { id: 'deliveries', labelKey: 'account.deliveries', icon: Truck },
  { id: 'conversations', labelKey: 'account.conversations', icon: MessageSquare },
  { id: 'returns', labelKey: 'account.returns', icon: RotateCcw },
] as const;

export default function MyAccountPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Customer | null>(null);
  const [history, setHistory] = useState<MyHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('notifications');
  const [editing, setEditing] = useState(false);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, h] = await Promise.all([getMyCustomerProfile(), getMyHistory()]);
      setProfile(p);
      setHistory(h);
      if (!p) setEditing(true);
      if (p) setNotifications(await getMyNotifications().catch(() => []));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const logout = async () => {
    await supabase.auth.signOut();
    onBack();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-5 flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 max-w-md">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sand-50 dark:bg-sand-900">
      <header className="bg-white dark:bg-sand-800 border-b border-sand-200 dark:border-sand-700 px-4 sm:px-6 h-16 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-ocre-500 to-ocre-700 flex items-center justify-center text-white font-bold text-sm">{(profile?.name ?? 'C').charAt(0).toUpperCase()}</div>
          <div>
            <h1 className="font-display font-bold text-sand-900 text-sm sm:text-base">{profile?.name ?? 'Mon compte'}</h1>
            <span className="text-xs text-sand-400 dark:text-sand-500">{profile?.phone ?? ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(true)} className="p-2 rounded-lg hover:bg-sand-100 text-sand-600 dark:text-sand-300" title={t('account.edit_profile')}><Pencil className="w-4 h-4" /></button>
          <button onClick={() => void logout()} className="p-2 rounded-lg hover:bg-sand-100 text-sand-600 dark:text-sand-300" title={t('account.logout')}><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((tabDef) => {
            const Icon = tabDef.icon;
            const unread = tabDef.id === 'notifications' ? notifications.filter((n) => !n.read).length : 0;
            return (
              <button
                key={tabDef.id}
                onClick={() => setTab(tabDef.id)}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${tab === tabDef.id ? 'bg-ocre-600 text-white' : 'bg-white text-sand-600 hover:bg-sand-100'}`}
              >
                <Icon className="w-4 h-4" /> {t(tabDef.labelKey)}
                {unread > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{unread}</span>}
              </button>
            );
          })}
        </div>

        {tab === 'notifications' && <NotificationsTab notifications={notifications} onRead={(id) => { void markMyNotificationRead(id); setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n))); }} />}
        {history && tab === 'orders' && <OrdersTab history={history} onChanged={load} />}
        {history && tab === 'payments' && <PaymentsTab history={history} />}
        {history && tab === 'deliveries' && <DeliveriesTab history={history} />}
        {history && tab === 'conversations' && <ConversationsTab history={history} customer={profile} onChanged={load} />}
        {history && tab === 'returns' && <ReturnsTab history={history} />}
      </div>

      {editing && (
        <ProfileModal
          profile={profile}
          onClose={() => (profile ? setEditing(false) : onBack())}
          onSaved={() => { setEditing(false); void load(); }}
        />
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="card p-8 text-center text-sand-400 text-sm">{label}</div>;
}

function NotificationsTab({ notifications, onRead }: { notifications: CustomerNotification[]; onRead: (id: string) => void }) {
  if (notifications.length === 0) return <EmptyState label="Aucune notification pour le moment." />;
  return (
    <div className="space-y-2">
      {notifications.map((n) => (
        <button key={n.id} onClick={() => !n.read && onRead(n.id)} className={`card p-4 w-full text-left ${!n.read ? 'border-ocre-200 dark:border-ocre-700 bg-ocre-50/30 dark:bg-ocre-900/20' : ''}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sand-900 dark:text-sand-100 text-sm">{n.title}</span>
            {!n.read && <span className="w-2 h-2 rounded-full bg-ocre-500 shrink-0" />}
          </div>
          {n.message && <p className="text-sm text-sand-600 dark:text-sand-300">{n.message}</p>}
          <span className="text-xs text-sand-400 dark:text-sand-500">{timeAgo(n.created_at)}</span>
        </button>
      ))}
    </div>
  );
}

function OrdersTab({ history, onChanged }: { history: MyHistory; onChanged: () => void }) {
  if (history.orders.length === 0) return <EmptyState label="Vous n'avez pas encore de commande." />;
  return (
    <div className="space-y-2">
      {history.orders.map((o) => (
        <div key={o.id} className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="font-mono text-sm font-semibold text-sand-900 dark:text-sand-100">{o.code}</span>
              <span className="text-xs text-sand-400 dark:text-sand-500 ml-2">{formatDateTime(o.created_at)}</span>
            </div>
            <span className={`badge ${ORDER_STATUS_COLORS[o.status]}`}>{ORDER_STATUS_LABELS[o.status] ?? o.status}</span>
          </div>
          <div className="space-y-1 mb-2">
            {(history.orderItemsByOrder[o.id] ?? []).map((item) => (
              <OrderLineWithReturn key={item.id} order={o} item={item} onChanged={onChanged} />
            ))}
          </div>
          <div className="flex justify-between text-sm font-bold text-sand-900 dark:text-sand-100 pt-2 border-t border-sand-100 dark:border-sand-700">
            <span>Total</span><span>{formatFCFA(o.total)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderLineWithReturn({ order, item, onChanged }: { order: MyHistory['orders'][number]; item: OrderItem; onChanged: () => void }) {
  const [showReturn, setShowReturn] = useState(false);
  const canRequestReturn = order.status === 'DELIVERED';

  return (
    <div className="py-1">
      <div className="flex justify-between gap-2 text-sm text-sand-600 dark:text-sand-300">
        <span className="truncate">{item.quantity} × {item.product_name}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span>{formatFCFA(item.unit_price * item.quantity)}</span>
          {canRequestReturn && (
            <button onClick={() => setShowReturn(true)} className="text-xs text-ocre-700 hover:underline">Retour</button>
          )}
        </div>
      </div>
      {showReturn && <ReturnRequestForm orderId={order.id} orderItemId={item.id} onClose={() => setShowReturn(false)} onSubmitted={() => { setShowReturn(false); onChanged(); }} />}
    </div>
  );
}

function ReturnRequestForm({ orderId, orderItemId, onClose, onSubmitted }: { orderId: string; orderItemId: string; onClose: () => void; onSubmitted: () => void }) {
  const [reasonCategory, setReasonCategory] = useState<Return['reason_category']>('DEFECTIVE');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await requestReturn(orderId, orderItemId, reasonCategory, comment || undefined);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de demander ce retour.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-2 p-3 rounded-lg bg-sand-50 dark:bg-sand-900 space-y-2">
      <select className="input" value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value as Return['reason_category'])}>
        {Object.entries(RETURN_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input className="input" placeholder="Précisez (facultatif)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 px-3 py-1.5 rounded-lg border border-sand-200 dark:border-sand-600 text-sand-600 dark:text-sand-300 text-xs font-medium">Annuler</button>
        <button onClick={() => void submit()} disabled={sending} className="btn-primary flex-1 text-xs py-1.5">{sending ? 'Envoi...' : 'Envoyer la demande'}</button>
      </div>
    </div>
  );
}

function PaymentsTab({ history }: { history: MyHistory }) {
  if (history.payments.length === 0) return <EmptyState label="Aucun paiement." />;
  return (
    <div className="space-y-2">
      {history.payments.map((p) => (
        <div key={p.id} className="card p-4 flex items-center justify-between">
          <div>
            <div className="font-medium text-sand-900 text-sm">{formatFCFA(p.amount)}</div>
            <div className="text-xs text-sand-400 dark:text-sand-500">{p.method === 'CASH_ON_DELIVERY' ? 'Paiement à la livraison' : 'Orange Money'}</div>
          </div>
          <span className={`badge ${PAYMENT_STATUS_COLORS[p.status]}`}>{PAYMENT_STATUS_LABELS[p.status] ?? p.status}</span>
        </div>
      ))}
    </div>
  );
}

function DeliveriesTab({ history }: { history: MyHistory }) {
  if (history.deliveries.length === 0) return <EmptyState label="Aucune livraison pour le moment." />;
  return (
    <div className="space-y-2">
      {history.deliveries.map((d) => (
        <div key={d.id} className="card p-4 flex items-center justify-between">
          <div className="text-sm text-sand-700">Assignée {timeAgo(d.assigned_at)}</div>
          <span className="badge bg-sand-100 text-sand-700">{d.status}</span>
        </div>
      ))}
    </div>
  );
}

function ConversationsTab({ history, customer, onChanged }: { history: MyHistory; customer: Customer | null; onChanged: () => void }) {
  const [showNewComplaint, setShowNewComplaint] = useState(false);
  return (
    <div className="space-y-3">
      <button onClick={() => setShowNewComplaint(true)} className="btn-primary w-full">Signaler un problème / nouvelle réclamation</button>
      {history.conversations.length === 0 ? (
        <EmptyState label="Aucune conversation avec le chatbot ou le service client." />
      ) : history.conversations.map((c) => (
        <div key={c.id} className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="badge bg-sand-100 text-sand-600 dark:text-sand-300">{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
            <span className="text-xs text-sand-400 dark:text-sand-500">{timeAgo(c.updated_at)}</span>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {(history.messagesByConversation[c.id] ?? []).map((m) => (
              <div key={m.id} className={`flex ${m.sender === 'CUSTOMER' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-sm ${m.sender === 'CUSTOMER' ? 'bg-indigo-600 text-white' : 'bg-sand-100 text-sand-800'}`}>{m.content}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {showNewComplaint && customer && (
        <NewComplaintModal customerId={customer.id} onClose={() => setShowNewComplaint(false)} onSubmitted={() => { setShowNewComplaint(false); onChanged(); }} />
      )}
    </div>
  );
}

function NewComplaintModal({ customerId, onClose, onSubmitted }: { customerId: string; onClose: () => void; onSubmitted: () => void }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await createComplaint(customerId, null, subject, message, 'SITE');
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer la réclamation.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-sand-800 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-sand-200 dark:border-sand-700"><h2 className="font-display text-lg font-bold text-sand-900 dark:text-sand-100">Nouvelle réclamation</h2></div>
        <div className="p-5 space-y-3">
          <input className="input" placeholder="Objet" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className="input min-h-[100px]" placeholder="Décrivez votre problème" value={message} onChange={(e) => setMessage(e.target.value)} />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-sand-200 text-sand-600 text-sm font-medium">Annuler</button>
            <button onClick={() => void submit()} disabled={sending || !subject.trim() || !message.trim()} className="btn-primary flex-1">{sending ? 'Envoi...' : 'Envoyer'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReturnsTab({ history }: { history: MyHistory }) {
  if (history.returns.length === 0) return <EmptyState label="Aucun retour enregistré." />;
  return (
    <div className="space-y-2">
      {history.returns.map((r) => (
        <div key={r.id} className="card p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-sand-800">{RETURN_REASON_LABELS[r.reason_category] ?? r.reason}</span>
            <span className={`badge ${RETURN_STATUS_COLORS[r.status]}`}>{RETURN_STATUS_LABELS[r.status] ?? r.status}</span>
          </div>
          {r.comment && <p className="text-xs text-sand-500 dark:text-sand-400">{r.comment}</p>}
          {r.resolution && <p className="text-xs text-sand-400 italic mt-1">Réponse RATELAFRICA : {r.resolution}</p>}
        </div>
      ))}
    </div>
  );
}

function ProfileModal({ profile, onClose, onSaved }: { profile: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [neighborhood, setNeighborhood] = useState(profile?.neighborhood ?? '');
  const [address, setAddress] = useState(profile?.address ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateMyCustomerProfile(name, phone, neighborhood, address || undefined);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mise à jour impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-sand-800 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-sand-200 dark:border-sand-700">
          <h2 className="font-display text-lg font-bold text-sand-900 flex items-center gap-2"><User className="w-5 h-5 text-ocre-600" /> Mon profil</h2>
        </div>
        <div className="p-5 space-y-4">
          <div><label className="label">Nom complet</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label">Téléphone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><label className="label">Quartier</label><input className="input" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} /></div>
          <div>
            <label className="label">Point de repère / adresse (facultatif)</label>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {error && <p className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            {profile && <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-sand-200 text-sand-600 hover:bg-sand-50 dark:hover:bg-sand-700 text-sm font-medium">Annuler</button>}
            <button disabled={saving || !name || !phone || !neighborhood} onClick={submit} className="btn-primary flex-1">{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
