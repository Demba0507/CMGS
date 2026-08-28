import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard, Package, Layers, Truck, Users, ShoppingCart,
  CreditCard, Bike, MessageSquare, Bot, Bell, BarChart3,
  Settings, ScrollText, Store, ChevronLeft, ChevronRight, UserCog, RotateCcw, MessageCircle, Wrench, LogOut, Menu, X,
} from 'lucide-react';
import { useCurrentProfile } from '@/lib/currentProfile';

export interface NavItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'products', label: 'Produits', icon: Package },
  { id: 'categories', label: 'Catégories', icon: Layers },
  { id: 'suppliers', label: 'Fournisseurs', icon: Store },
  { id: 'customers', label: 'Clients', icon: Users },
  { id: 'employees', label: 'Employés', icon: UserCog },
  { id: 'orders', label: 'Commandes', icon: ShoppingCart },
  { id: 'payments', label: 'Paiements', icon: CreditCard },
  { id: 'deliveries', label: 'Livraisons', icon: Truck },
  { id: 'drivers', label: 'Livreurs', icon: Bike },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare },
  { id: 'complaints', label: 'Réclamations', icon: MessageCircle },
  { id: 'returns', label: 'Retours', icon: RotateCcw },
  { id: 'simulator', label: 'Simulateur IA', icon: Bot },
  { id: 'notifications', label: 'Relances', icon: Bell },
  { id: 'stats', label: 'Statistiques', icon: BarChart3 },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  { id: 'settings', label: 'Paramètres', icon: Settings },
];

export default function DashboardLayout({ active, onNavigate, onLogout, children }: { active: string; onNavigate: (id: string) => void; onLogout: () => void; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { fullName, email } = useCurrentProfile();
  const displayName = fullName || email || 'Utilisateur';
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?';

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleNavigate = (id: string) => {
    onNavigate(id);
    setMobileOpen(false); // sur mobile, le menu se referme après un choix
  };

  return (
    <div className="flex h-screen bg-sand-50 overflow-hidden">
      {/* Fond semi-transparent affiché derrière le menu déroulant sur mobile uniquement */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar : tiroir plein écran sur mobile (masqué par défaut), colonne fixe à partir de lg */}
      <aside
        className={`${collapsed ? 'lg:w-16' : 'lg:w-60'} fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] shrink-0 bg-sand-900 text-sand-300 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 lg:transition-all ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-16 flex items-center gap-2 px-4 border-b border-sand-800 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-ocre-500 to-ocre-700 flex items-center justify-center text-white font-bold text-sm font-display shrink-0">C</div>
          {!collapsed && <span className="font-display font-bold text-white text-sm whitespace-nowrap">CMGS Commerce</span>}
          <button onClick={() => setMobileOpen(false)} className="ml-auto lg:hidden p-1.5 rounded-lg hover:bg-sand-800 text-sand-400" title="Fermer le menu">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive ? 'bg-ocre-600 text-white' : 'text-sand-400 hover:bg-sand-800 hover:text-white'}`}
                title={item.label}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </button>
            );
          })}
        </nav>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex h-10 items-center justify-center border-t border-sand-800 text-sand-500 hover:text-white hover:bg-sand-800 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-16 bg-white border-b border-sand-200 flex items-center justify-between px-4 sm:px-6 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-sand-100 text-sand-600 shrink-0" title="Menu">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display text-lg font-bold text-sand-900 truncate">
              {NAV_ITEMS.find((n) => n.id === active)?.label ?? 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-sand-500 hidden sm:block truncate max-w-[160px]" title={displayName}>{displayName}</span>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-medium text-sm shrink-0" title={displayName}>{initials}</div>
            <button
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              className="p-2 rounded-lg hover:bg-sand-100 text-sand-500 hover:text-sand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Se déconnecter"
            >
              {loggingOut ? (
                <div className="w-4 h-4 border-2 border-sand-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
