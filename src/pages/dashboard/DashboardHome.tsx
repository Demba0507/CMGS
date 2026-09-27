import { useState, useEffect } from 'react';
import { TrendingUp, ShoppingCart, Users, Truck, DollarSign, Package, AlertTriangle, Bell, CreditCard, RotateCcw, Bot, type LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Order, OrderItem, Product, Customer, Notification, Payment, Delivery, Return, Conversation } from '@/lib/types';
import { formatFCFA, formatDateTime, timeAgo } from '@/lib/format';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/constants';
import { calculateSummary } from '@/lib/finance';

export default function DashboardHome({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [dailySales, setDailySales] = useState<{ date: string; total: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; code: string; qty: number; revenue: number }[]>([]);
  const [margin, setMargin] = useState(0);
  const [commission, setCommission] = useState(0);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [returns, setReturns] = useState<Return[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: p }, { data: c }, { data: n }, { data: pay }, { data: del }, { data: ret }, { data: conv }] = await Promise.all([
        supabase.from('orders').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('products').select('*').is('deleted_at', null),
        supabase.from('customers').select('*'),
        supabase.from('notifications').select('*').eq('read', false).order('created_at', { ascending: false }).limit(10),
        supabase.from('payments').select('*'),
        supabase.from('deliveries').select('*'),
        supabase.from('returns').select('*'),
        supabase.from('conversations').select('*'),
      ]);
      setPayments((pay as Payment[]) ?? []);
      setDeliveries((del as Delivery[]) ?? []);
      setReturns((ret as Return[]) ?? []);
      setConversations((conv as Conversation[]) ?? []);
      const allOrders = (o as Order[]) ?? [];
      const allProducts = (p as Product[]) ?? [];
      const allCustomers = (c as Customer[]) ?? [];
      setOrders(allOrders);
      setProducts(allProducts);
      setCustomers(allCustomers);
      setNotifications((n as Notification[]) ?? []);

      const delivered = allOrders.filter((o) => o.status === 'DELIVERED');
      const cancelled = allOrders.filter((o) => o.status === 'CANCELLED');
      const pending = allOrders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED');
      const totalRevenue = delivered.reduce((s, o) => s + o.total, 0);
      setRevenue(totalRevenue);
      setDeliveredCount(delivered.length);
      setCancelledCount(cancelled.length);
      setPendingCount(pending.length);

      // Low stock
      setLowStockProducts(allProducts.filter((p) => p.stock > 0 && p.stock <= (p.low_stock_threshold ?? 5)).sort((a, b) => a.stock - b.stock));

      // Margin & commission
      const { data: items } = await supabase.from('order_items').select('*, orders!inner(status, deleted_at)').eq('orders.status', 'DELIVERED').is('orders.deleted_at', null);
      const allItems = (items as (OrderItem & { orders: { status: string; deleted_at: string | null } })[]) ?? [];
      const summary = calculateSummary(allItems.map((i) => ({ quantity: i.quantity, salePrice: i.unit_price, purchasePrice: i.supplier_price })));
      setMargin(summary.grossMargin);
      setCommission(summary.supplierCommission);

      // Daily sales (last 7 days)
      const days: { date: string; total: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().slice(0, 10);
        const dayTotal = allOrders.filter((o) => o.created_at.slice(0, 10) === dayStr && o.status !== 'CANCELLED').reduce((s, o) => s + o.total, 0);
        days.push({ date: dayStr, total: dayTotal });
      }
      setDailySales(days);

      // Top products
      const productMap: Record<string, { name: string; code: string; qty: number; revenue: number }> = {};
      allItems.forEach((i) => {
        const key = i.product_code || i.product_name;
        if (!productMap[key]) productMap[key] = { name: i.product_name, code: i.product_code || '', qty: 0, revenue: 0 };
        productMap[key].qty += i.quantity;
        productMap[key].revenue += i.unit_price * i.quantity;
      });
      setTopProducts(Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 5));

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const maxSale = Math.max(...dailySales.map((d) => d.total), 1);
  const prospects = customers.filter((c) => c.status === 'PROSPECT').length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Chiffre d'affaires" value={formatFCFA(revenue)} color="ocre" />
        <KpiCard icon={ShoppingCart} label="Commandes livrées" value={String(deliveredCount)} sub={`${pendingCount} en cours`} color="green" />
        <KpiCard icon={Users} label="Clients" value={String(customers.length)} sub={`${prospects} prospects`} color="indigo" />
        <KpiCard icon={TrendingUp} label="Marge + Commission" value={formatFCFA(margin + commission)} sub={`Marge: ${formatFCFA(margin)}`} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales chart */}
        <div className="lg:col-span-2 card p-5">
          <h3 className="font-semibold text-sand-900 dark:text-sand-100 mb-1">Ventes des 7 derniers jours</h3>
          <p className="text-xs text-sand-500 dark:text-sand-400 mb-4">Montant total des commandes par jour (hors annulées)</p>
          <div className="flex items-end justify-between gap-2 h-48">
            {dailySales.map((d) => {
              const heightPct = (d.total / maxSale) * 100;
              const dayLabel = new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short' });
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="w-full flex-1 flex items-end relative">
                    <div className="w-full bg-gradient-to-t from-ocre-600 to-ocre-400 rounded-t-lg transition-all group-hover:from-ocre-700 group-hover:to-ocre-500 relative" style={{ height: `${Math.max(heightPct, 2)}%` }}>
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-sand-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">{formatFCFA(d.total)}</div>
                    </div>
                  </div>
                  <span className="text-xs text-sand-500 dark:text-sand-400 capitalize">{dayLabel}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Notifications */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sand-900 dark:text-sand-100 flex items-center gap-2"><Bell className="w-4 h-4 text-ocre-600" /> Notifications</h3>
            <button onClick={() => onNavigate('notifications')} className="text-xs text-ocre-600 hover:text-ocre-700">Voir tout</button>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {notifications.length === 0 ? <p className="text-sm text-sand-400 text-center py-4">Aucune notification</p> : notifications.map((n) => (
              <div key={n.id} className="p-3 rounded-lg bg-sand-50 dark:bg-sand-800 border border-sand-200/60 hover:bg-sand-100 transition-colors cursor-pointer">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-ocre-500 mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-sand-900 dark:text-sand-100">{n.title}</div>
                    <div className="text-xs text-sand-500 dark:text-sand-400">{n.message}</div>
                    <div className="text-[10px] text-sand-400 dark:text-sand-500 mt-1">{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent orders */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sand-900 dark:text-sand-100">Commandes récentes</h3>
            <button onClick={() => onNavigate('orders')} className="text-xs text-ocre-600 hover:text-ocre-700">Voir tout</button>
          </div>
          <div className="space-y-2">
            {orders.slice(0, 6).map((o) => (
              <div key={o.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-sand-50 dark:hover:bg-sand-700 transition-colors">
                <div className="min-w-0">
                  <div className="font-mono text-sm font-medium text-sand-900 dark:text-sand-100">{o.code}</div>
                  <div className="text-xs text-sand-500 dark:text-sand-400">{formatDateTime(o.created_at)}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`badge ${ORDER_STATUS_COLORS[o.status] ?? ''}`}>{ORDER_STATUS_LABELS[o.status] ?? o.status}</span>
                  <span className="font-bold text-sm text-sand-900 dark:text-sand-100">{formatFCFA(o.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top products */}
        <div className="card p-5">
          <h3 className="font-semibold text-sand-900 dark:text-sand-100 mb-4">Produits les plus vendus</h3>
          <div className="space-y-2">
            {topProducts.length === 0 ? <p className="text-sm text-sand-400 dark:text-sand-500 text-center py-4">Aucune vente enregistrée</p> : topProducts.map((p, i) => (
              <div key={p.code} className="flex items-center gap-3 p-3 rounded-lg hover:bg-sand-50 dark:hover:bg-sand-700 transition-colors">
                <span className="w-6 h-6 rounded-full bg-ocre-100 dark:bg-ocre-900/40 text-ocre-700 dark:text-ocre-300 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-sand-900 dark:text-sand-100 truncate">{p.name}</div>
                  <div className="font-mono text-xs text-sand-400 dark:text-sand-500">{p.code}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-sand-900 dark:text-sand-100">{p.qty} vendus</div>
                  <div className="text-xs text-sand-500 dark:text-sand-400">{formatFCFA(p.revenue)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Résumé opérationnel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat icon={CreditCard} label="Paiements à vérifier" value={payments.filter((p) => p.status === 'PENDING').length} onClick={() => onNavigate('payments')} color="ocre" />
        <MiniStat icon={Truck} label="Livraisons en cours" value={deliveries.filter((d) => !['DELIVERED', 'RETURNED', 'FAILED'].includes(d.status)).length} onClick={() => onNavigate('deliveries')} color="indigo" />
        <MiniStat icon={RotateCcw} label="Retours en attente" value={returns.filter((r) => r.status === 'REQUESTED').length} onClick={() => onNavigate('returns')} color="blue" />
        <MiniStat
          icon={Bot}
          label="Résolution chatbot"
          value={conversations.length > 0 ? `${Math.round((conversations.filter((c) => c.status !== 'AWAITING_HUMAN' && c.status !== 'HUMAN_HANDLING').length / conversations.length) * 100)}%` : '—'}
          onClick={() => onNavigate('conversations')}
          color="green"
        />
      </div>

      {/* Alertes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="font-semibold text-sand-900 dark:text-sand-100 flex items-center gap-2 mb-4"><AlertTriangle className="w-4 h-4 text-ocre-600" /> Stock faible</h3>
          {lowStockProducts.length === 0 ? <p className="text-sm text-sand-400 dark:text-sand-500">Tous les stocks sont à un bon niveau.</p> : (
            <div className="space-y-2">
              {lowStockProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-ocre-50 dark:bg-ocre-900/20 border border-ocre-100 dark:border-ocre-800">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-ocre-600" />
                    <span className="font-mono text-xs text-sand-500 dark:text-sand-400">{p.code}</span>
                    <span className="text-sm font-medium text-sand-900 dark:text-sand-100">{p.name}</span>
                  </div>
                  <span className="badge bg-ocre-200 dark:bg-ocre-800 text-ocre-800 dark:text-ocre-200">{p.stock} restant</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-sand-900 dark:text-sand-100 flex items-center gap-2 mb-4"><Truck className="w-4 h-4 text-indigo-600" /> Statut rapide</h3>
          <div className="grid grid-cols-2 gap-3">
            <StatBox label="Commandes en cours" value={pendingCount} color="ocre" />
            <StatBox label="Commandes livrées" value={deliveredCount} color="green" />
            <StatBox label="Commandes annulées" value={cancelledCount} color="red" />
            <StatBox label="Produits actifs" value={products.filter((p) => p.status === 'ACTIVE').length} color="indigo" />
          </div>
        </div>
      </div>
    </div>
  );
}

const colorMap: Record<string, string> = {
  ocre: 'bg-ocre-100 dark:bg-ocre-900/40 text-ocre-700 dark:text-ocre-300',
  green: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  indigo: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
  blue: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  red: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
};

function KpiCard({ icon: Icon, label, value, sub, color }: { icon: LucideIcon; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}><Icon className="w-5 h-5" /></div>
      </div>
      <div className="font-display text-2xl sm:text-[28px] font-bold text-sand-900 dark:text-sand-100 tracking-tight">{value}</div>
      <div className="text-sm text-sand-500 dark:text-sand-400 mt-1">{label}</div>
      {sub && <div className="text-xs text-sand-400 dark:text-sand-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`p-4 rounded-xl ${colorMap[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-80 mt-1">{label}</div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, onClick, color }: { icon: LucideIcon; label: string; value: number | string; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} className="stat-card text-left hover:shadow-card-hover transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[color]}`}><Icon className="w-4 h-4" /></div>
      </div>
      <div className="font-display text-xl font-bold text-sand-900 dark:text-sand-100">{value}</div>
      <div className="text-xs text-sand-500 mt-0.5">{label}</div>
    </button>
  );
}
