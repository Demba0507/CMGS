import { useState, useEffect } from 'react';
import { Trash2, Users, Store, Bike, Package, MessageSquare, ShoppingCart, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePermissions } from '@/lib/permissions';

interface TrashEntry {
  id: string;
  label: string;
  table: string;
  navigateTo: string;
  icon: typeof Users;
  permission: string;
}

const ENTRIES: TrashEntry[] = [
  { id: 'customers', label: 'Clients', table: 'customers', navigateTo: 'customers', icon: Users, permission: 'customers.delete' },
  { id: 'suppliers', label: 'Fournisseurs', table: 'suppliers', navigateTo: 'suppliers', icon: Store, permission: 'suppliers.delete' },
  { id: 'drivers', label: 'Livreurs', table: 'drivers', navigateTo: 'drivers', icon: Bike, permission: 'drivers.delete' },
  { id: 'products', label: 'Produits', table: 'products', navigateTo: 'products', icon: Package, permission: 'products.delete' },
  { id: 'conversations', label: 'Conversations', table: 'conversations', navigateTo: 'conversations', icon: MessageSquare, permission: 'conversations.delete' },
  { id: 'orders', label: 'Commandes', table: 'orders', navigateTo: 'orders', icon: ShoppingCart, permission: 'orders.delete' },
];

/**
 * Étape 48 — corrige un vrai lien mort : "Corbeille" existait dans le menu
 * (§46) mais ne menait nulle part, aucune route ne le gérait. Plutôt que
 * de dupliquer restaurer/purger pour chaque type d'élément (déjà bien
 * fait et testé dans chaque page dédiée — stock à re-réserver pour
 * produits/commandes, sauvegarde requise pour les purges, etc.), cette
 * page ne fait qu'un point d'entrée clair : un compte par type d'élément,
 * avec un lien vers sa page pour restaurer/purger réellement.
 */
export default function TrashOverviewPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { has } = usePermissions();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const visible = ENTRIES.filter((e) => has(e.permission));
      const results = await Promise.all(
        visible.map((e) => supabase.from(e.table).select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null))
      );
      const next: Record<string, number> = {};
      visible.forEach((e, i) => { next[e.id] = results[i].count ?? 0; });
      setCounts(next);
      setLoading(false);
    })();
  }, [has]);

  const visibleEntries = ENTRIES.filter((e) => has(e.permission));

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h2 className="font-display text-xl font-bold text-sand-900 dark:text-sand-100 flex items-center gap-2"><Trash2 className="w-5 h-5 text-ocre-600" /> Corbeille</h2>
        <p className="text-sm text-sand-500 dark:text-sand-400">Vue d'ensemble des éléments supprimés — la restauration et la purge définitive se font depuis chaque page</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-ocre-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : visibleEntries.length === 0 ? (
        <div className="card p-8 text-center text-sand-400 dark:text-sand-500 text-sm">Aucune corbeille accessible avec vos permissions actuelles.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleEntries.map((e) => {
            const Icon = e.icon;
            const count = counts[e.id] ?? 0;
            return (
              <button
                key={e.id}
                onClick={() => onNavigate(e.navigateTo)}
                className="card p-5 text-left hover:shadow-card-hover transition-all flex items-center gap-4"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${count > 0 ? 'bg-ocre-100 dark:bg-ocre-900/40 text-ocre-700 dark:text-ocre-300' : 'bg-sand-100 dark:bg-sand-700 text-sand-400 dark:text-sand-500'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sand-900 dark:text-sand-100">{e.label}</div>
                  <div className="text-sm text-sand-500 dark:text-sand-400">{count} élément{count > 1 ? 's' : ''} en corbeille</div>
                </div>
                <ChevronRight className="w-4 h-4 text-sand-400 dark:text-sand-500 shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
