import { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, Users, Package, Store, Bike, DollarSign, Archive, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Order, Product, Customer, Supplier, Driver, OrderItem, AccountingPeriod, PeriodFinancials } from '@/lib/types';
import { formatFCFA, formatDateTime } from '@/lib/format';
import { CHANNEL_LABELS, CUSTOMER_STATUS_LABELS } from '@/lib/constants';
import { calculateSummary } from '@/lib/finance';
import { listAccountingPeriods, getPeriodFinancials, closeAccountingPeriod } from '@/lib/accounting';
import { useToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import ConfirmPasswordModal from '@/components/ConfirmPasswordModal';
import ExportButtons from '@/components/ExportButtons';
import type { ExportColumn } from '@/lib/export';

type StatsRange = 'today' | '7d' | '30d' | '12m';
const RANGE_LABELS: Record<StatsRange, string> = { today: "Aujourd'hui", '7d': '7 jours', '30d': '30 jours', '12m': '12 mois' };
function rangeStart(range: StatsRange): Date {
  const now = new Date();
  switch (range) {
    case 'today': return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case '7d': return new Date(now.getTime() - 7 * 86400000);
    case '30d': return new Date(now.getTime() - 30 * 86400000);
    case '12m': { const d = new Date(now); d.setMonth(d.getMonth() - 12); return d; }
  }
}

function AccountingSection() {
  const toast = useToast();
  const { confirmAction } = useConfirm();
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [financials, setFinancials] = useState<PeriodFinancials | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [pendingLabel, setPendingLabel] = useState('');

  const load = useCallback(async (periodId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [p, f] = await Promise.all([listAccountingPeriods(), getPeriodFinancials(periodId)]);
      setPeriods(p);
      setFinancials(f);
      if (f) setSelectedPeriodId(f.period_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectPeriod = async (id: string) => {
    setSelectedPeriodId(id);
    try {
      setFinancials(await getPeriodFinancials(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    }
  };

  const close = () => {
    confirmAction({
      title: 'Clôturer la période comptable',
      message: 'Une nouvelle période comptable sera ouverte à partir de maintenant. Cette action nécessitera ensuite la confirmation de votre mot de passe.',
      confirmLabel: 'Continuer',
      successMessage: 'Confirmez votre mot de passe pour finaliser.',
      input: { label: 'Libellé de la nouvelle période', placeholder: 'ex : 2026-10' },
      onConfirm: (label) => {
        setPendingLabel(label ?? '');
        setShowPasswordConfirm(true);
      },
    });
  };

  const doClose = async () => {
    setShowPasswordConfirm(false);
    setClosing(true);
    setError(null);
    try {
      await closeAccountingPeriod(pendingLabel || undefined);
      await load();
      toast.success('Période comptable clôturée avec succès.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Clôture impossible. Une sauvegarde récente (moins d\'1h) est requise — créez-en une depuis Maintenance.';
      setError(message);
      toast.error(message);
    } finally {
      setClosing(false);
    }
  };

  if (loading) return null;
  if (error) return <div className="card p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400 mb-6">{error}</div>;
  if (!financials) return null;

  const currentPeriod = periods.find((p) => p.id === selectedPeriodId);

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="font-semibold text-sand-900 flex items-center gap-2"><Archive className="w-5 h-5 text-ocre-600" /> Comptabilité par période</h3>
        <div className="flex items-center gap-2">
          <select className="input max-w-[180px] py-1.5" value={selectedPeriodId ?? ''} onChange={(e) => void selectPeriod(e.target.value)}>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.label} {p.status === 'OPEN' ? '(active)' : ''}</option>)}
          </select>
          {currentPeriod?.status === 'OPEN' && (
            <button onClick={() => void close()} disabled={closing} className="text-xs px-3 py-1.5 rounded-lg bg-ocre-600 text-white hover:bg-ocre-700 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Clôturer et ouvrir une nouvelle période
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FinLine label="Chiffre d'affaires" value={financials.sales_amount} />
        <FinLine label="Prix d'achat RATELAFRICA" value={financials.purchase_amount} />
        <FinLine label="Économie fournisseur" value={financials.supplier_savings} />
        <FinLine label="Marge RATELAFRICA" value={financials.gross_margin} />
        <FinLine label="Frais de livraison" value={financials.delivery_fees} />
        <FinLine label="Commission fournisseur" value={financials.supplier_commission} />
        <FinLine label="Bénéfice RATELAFRICA" value={financials.ratel_earnings} highlight />
        <FinLine label="Commandes" value={financials.orders_count} isCount />
      </div>
      {currentPeriod?.status === 'CLOSED' && <p className="text-xs text-sand-400 mt-3">Période clôturée le {currentPeriod.closed_at ? formatDateTime(currentPeriod.closed_at) : ''} — lecture seule.</p>}
      {showPasswordConfirm && (
        <ConfirmPasswordModal
          title="Clôturer la période comptable"
          description="Cette action clôture définitivement la période active et en ouvre une nouvelle. L'historique reste consultable mais cette étape ne peut pas être annulée."
          onCancel={() => setShowPasswordConfirm(false)}
          onConfirmed={() => void doClose()}
        />
      )}
    </div>
  );
}

function FinLine({ label, value, highlight, isCount }: { label: string; value: number; highlight?: boolean; isCount?: boolean }) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-ocre-50' : 'bg-sand-50 dark:bg-sand-800'}`}>
      <div className="text-xs text-sand-500 mb-0.5">{label}</div>
      <div className={`text-sm font-bold ${highlight ? 'text-ocre-700' : 'text-sand-900'}`}>{isCount ? value : formatFCFA(value)}</div>
    </div>
  );
}

export default function StatsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<StatsRange>('30d');

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: p }, { data: c }, { data: s }, { data: d }, { data: i }] = await Promise.all([
        supabase.from('orders').select('*').is('deleted_at', null),
        supabase.from('products').select('*').is('deleted_at', null),
        supabase.from('customers').select('*'),
        supabase.from('suppliers').select('*'),
        supabase.from('drivers').select('*'),
        supabase.from('order_items').select('*'),
      ]);
      setOrders((o as Order[]) ?? []);
      setProducts((p as Product[]) ?? []);
      setCustomers((c as Customer[]) ?? []);
      setSuppliers((s as Supplier[]) ?? []);
      setDrivers((d as Driver[]) ?? []);
      setItems((i as OrderItem[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const delivered = orders.filter((o) => o.status === 'DELIVERED' && new Date(o.created_at) >= rangeStart(range));
  const deliveredItems = items.filter((i) => delivered.some((o) => o.id === i.order_id));
  const deliveryFees = delivered.reduce((s, o) => s + o.delivery_fee, 0);
  const serviceFees = delivered.reduce((s, o) => s + o.service_fee, 0);
  const summary = calculateSummary(deliveredItems.map((i) => ({ quantity: i.quantity, salePrice: i.unit_price, purchasePrice: i.supplier_price })), deliveryFees, serviceFees);
  const revenue = summary.salesAmount + deliveryFees + serviceFees;
  const margin = summary.grossMargin;
  const commission = summary.supplierCommission;
  const result = summary.cmgsEarnings;

  // Channel breakdown
  const channelStats = Object.keys(CHANNEL_LABELS).map((ch) => {
    const chOrders = delivered.filter((o) => o.channel === ch);
    return { channel: ch, count: chOrders.length, revenue: chOrders.reduce((s, o) => s + o.total, 0) };
  }).filter((c) => c.count > 0);

  // Customer status breakdown
  const customerStats = Object.keys(CUSTOMER_STATUS_LABELS).map((st) => ({
    status: st,
    count: customers.filter((c) => c.status === st).length,
  }));

  // Top products
  const productMap: Record<string, { name: string; code: string; qty: number; revenue: number }> = {};
  deliveredItems.forEach((i) => {
    const key = i.product_code || i.product_name;
    if (!productMap[key]) productMap[key] = { name: i.product_name, code: i.product_code || '', qty: 0, revenue: 0 };
    productMap[key].qty += i.quantity;
    productMap[key].revenue += i.unit_price * i.quantity;
  });
  const topProducts = Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= (p.low_stock_threshold ?? 5)).sort((a, b) => a.stock - b.stock);
  const outOfStock = products.filter((p) => p.stock <= 0);

  // Supplier performance
  const supplierStats = suppliers.map((s) => {
    const supItems = deliveredItems.filter((i) => i.supplier_id === s.id);
    return { name: s.name, code: s.code, products: products.filter((p) => p.supplier_id === s.id).length, revenue: supItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0), rating: s.quality_rating };
  }).sort((a, b) => b.revenue - a.revenue);

  // Driver performance
  const driverStats = drivers.map((d) => ({
    name: d.name, code: d.code,
    deliveries: orders.filter((o) => o.status === 'DELIVERED' && o.id === items.find((i) => i.order_id === o.id)?.order_id).length,
  }));

  const maxChannelRev = Math.max(...channelStats.map((c) => c.revenue), 1);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div><h2 className="font-display text-xl font-bold text-sand-900 dark:text-sand-100">Statistiques</h2><p className="text-sm text-sand-500 dark:text-sand-400">Analyse complète de votre activité</p></div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-sand-100 dark:bg-sand-800 p-1 rounded-lg">
          {(Object.keys(RANGE_LABELS) as StatsRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${range === r ? 'bg-white dark:bg-sand-700 text-sand-900 dark:text-sand-100 shadow-sm' : 'text-sand-500 dark:text-sand-400 hover:text-sand-700'}`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        <ExportButtons
          filename="rapport-rentabilite-cmgs"
          title="Rapport de rentabilité RATELAFRICA"
          columns={[
            { label: "Chiffre d'affaires", value: () => revenue },
            { label: 'Prix fournisseurs', value: () => revenue - margin },
            { label: 'Frais de livraison', value: () => deliveryFees },
            { label: 'Marge', value: () => margin },
            { label: 'Commission (0,01%)', value: () => commission },
            { label: 'Résultat RATELAFRICA', value: () => result },
          ] as ExportColumn<null>[]}
          rows={[null]}
        />
      </div>

      <AccountingSection />

      {/* Rentabilité */}
      <div className="card p-5">
        <h3 className="font-semibold text-sand-900 dark:text-sand-100 mb-4 flex items-center gap-2"><DollarSign className="w-5 h-5 text-ocre-600" /> Rentabilité RATELAFRICA — {RANGE_LABELS[range]}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20"><div className="text-sand-500 dark:text-sand-400 text-xs">Chiffre d'affaires</div><div className="font-bold text-green-700 dark:text-green-400">{formatFCFA(revenue)}</div></div>
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20"><div className="text-sand-500 dark:text-sand-400 text-xs">Prix fournisseurs</div><div className="font-bold text-red-700 dark:text-red-400">{formatFCFA(revenue - margin)}</div></div>
          <div className="p-3 rounded-lg bg-ocre-50 dark:bg-ocre-900/20"><div className="text-sand-500 dark:text-sand-400 text-xs">Frais de livraison</div><div className="font-bold text-ocre-700 dark:text-ocre-400">{formatFCFA(deliveryFees)}</div></div>
          <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20"><div className="text-sand-500 dark:text-sand-400 text-xs">Résultat RATELAFRICA</div><div className="font-bold text-indigo-700 dark:text-indigo-400">{formatFCFA(result)}</div></div>
        </div>
        <div className="mt-3 pt-3 border-t border-sand-100 dark:border-sand-700 flex flex-wrap gap-4 text-xs text-sand-500 dark:text-sand-400">
          <span>Marge: <strong className="text-sand-700">{formatFCFA(margin)}</strong></span>
          <span>Commission (0,01%): <strong className="text-sand-700">{formatFCFA(commission)}</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channels */}
        <div className="card p-5">
          <h3 className="font-semibold text-sand-900 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-indigo-600" /> Ventes par canal</h3>
          {channelStats.length === 0 ? <p className="text-sm text-sand-400">Aucune vente</p> : (
            <div className="space-y-3">
              {channelStats.map((c) => (
                <div key={c.channel}>
                  <div className="flex justify-between text-sm mb-1"><span className="font-medium text-sand-700">{CHANNEL_LABELS[c.channel]}</span><span className="text-sand-600">{formatFCFA(c.revenue)} ({c.count} cmd)</span></div>
                  <div className="h-2 bg-sand-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-ocre-500 to-ocre-600 rounded-full" style={{ width: `${(c.revenue / maxChannelRev) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Customer breakdown */}
        <div className="card p-5">
          <h3 className="font-semibold text-sand-900 mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600" /> Répartition clients</h3>
          <div className="grid grid-cols-3 gap-3">
            {customerStats.map((c) => (
              <div key={c.status} className="text-center p-4 rounded-xl bg-sand-50 dark:bg-sand-800">
                <div className="font-display text-2xl font-bold text-sand-900 dark:text-sand-100">{c.count}</div>
                <div className="text-xs text-sand-500 mt-1">{CUSTOMER_STATUS_LABELS[c.status]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top products */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sand-900 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-ocre-600" /> Produits les plus vendus</h3>
            <ExportButtons
              filename="produits-plus-vendus-cmgs"
              title="Produits les plus vendus"
              columns={[
                { label: 'Code', value: (p: typeof topProducts[number]) => p.code },
                { label: 'Produit', value: (p: typeof topProducts[number]) => p.name },
                { label: 'Quantité vendue', value: (p: typeof topProducts[number]) => p.qty },
                { label: 'Chiffre d\'affaires', value: (p: typeof topProducts[number]) => p.revenue },
              ]}
              rows={topProducts}
            />
          </div>
          {topProducts.length === 0 ? <p className="text-sm text-sand-400">Aucune vente</p> : (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.code} className="flex items-center gap-3 p-2 rounded-lg hover:bg-sand-50 dark:hover:bg-sand-700">
                  <span className="w-6 h-6 rounded-full bg-ocre-100 text-ocre-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <div className="flex-1 min-w-0"><div className="text-sm font-medium text-sand-900 truncate">{p.name}</div><div className="font-mono text-xs text-sand-400">{p.code}</div></div>
                  <div className="text-right"><div className="text-sm font-bold">{p.qty} vendus</div><div className="text-xs text-sand-500 dark:text-sand-400">{formatFCFA(p.revenue)}</div></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock alerts */}
        <div className="card p-5">
          <h3 className="font-semibold text-sand-900 mb-4 flex items-center gap-2"><Package className="w-5 h-5 text-ocre-600" /> Alerte stock</h3>
          <div className="space-y-2">
            {outOfStock.length > 0 && <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">Rupture de stock ({outOfStock.length})</div>}
            {outOfStock.slice(0, 3).map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-900/20"><div className="flex items-center gap-2"><span className="font-mono text-xs text-sand-500 dark:text-sand-400">{p.code}</span><span className="text-sm text-sand-700 dark:text-sand-300">{p.name}</span></div><span className="badge bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200">Épuisé</span></div>
            ))}
            {lowStock.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-ocre-50 dark:bg-ocre-900/20"><div className="flex items-center gap-2"><span className="font-mono text-xs text-sand-500 dark:text-sand-400">{p.code}</span><span className="text-sm text-sand-700 dark:text-sand-300">{p.name}</span></div><span className="badge bg-ocre-200 dark:bg-ocre-800 text-ocre-800 dark:text-ocre-200">{p.stock} restant</span></div>
            ))}
            {lowStock.length === 0 && outOfStock.length === 0 && <p className="text-sm text-sand-400">Tous les stocks sont sains</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Supplier performance */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sand-900 flex items-center gap-2"><Store className="w-5 h-5 text-indigo-600" /> Performance fournisseurs</h3>
            <ExportButtons
              filename="performance-fournisseurs-cmgs"
              title="Performance fournisseurs"
              columns={[
                { label: 'Code', value: (s: typeof supplierStats[number]) => s.code },
                { label: 'Fournisseur', value: (s: typeof supplierStats[number]) => s.name },
                { label: 'Produits', value: (s: typeof supplierStats[number]) => s.products },
                { label: "Chiffre d'affaires", value: (s: typeof supplierStats[number]) => s.revenue },
                { label: 'Note qualité', value: (s: typeof supplierStats[number]) => s.rating ?? '—' },
              ]}
              rows={supplierStats}
            />
          </div>
          <div className="space-y-2">
            {supplierStats.map((s) => (
              <div key={s.code} className="flex items-center justify-between p-2.5 rounded-lg bg-sand-50 dark:bg-sand-800">
                <div><div className="text-sm font-medium text-sand-900 dark:text-sand-100">{s.name}</div><div className="font-mono text-xs text-sand-400">{s.code} — {s.products} produits</div></div>
                <div className="text-right"><div className="text-sm font-bold text-sand-900 dark:text-sand-100">{formatFCFA(s.revenue)}</div></div>
              </div>
            ))}
          </div>
        </div>

        {/* Driver performance */}
        <div className="card p-5">
          <h3 className="font-semibold text-sand-900 mb-4 flex items-center gap-2"><Bike className="w-5 h-5 text-indigo-600" /> Performance livreurs</h3>
          <div className="space-y-2">
            {driverStats.map((d) => (
              <div key={d.code} className="flex items-center justify-between p-2.5 rounded-lg bg-sand-50 dark:bg-sand-800">
                <div><div className="text-sm font-medium text-sand-900 dark:text-sand-100">{d.name}</div><div className="font-mono text-xs text-sand-400">{d.code}</div></div>
                <span className="text-sm text-sand-700">{d.deliveries} livraison{d.deliveries > 1 ? 's' : ''}</span>
              </div>
            ))}
            {driverStats.length === 0 && <p className="text-sm text-sand-400">Aucun livreur</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
