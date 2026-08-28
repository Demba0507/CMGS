import { useState, useEffect, useCallback } from 'react';
import { Store, LayoutDashboard, User, Truck, Menu, X } from 'lucide-react';
import StoreFront from '@/pages/StoreFront';
import Dashboard from '@/pages/Dashboard';
import AuthPage from '@/pages/AuthPage';
import MyAccountPage from '@/pages/MyAccountPage';
import DriverPage from '@/pages/DriverPage';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { getPublicSettings } from '@/lib/settings';
import type { Session } from '@supabase/supabase-js';

type View = 'store' | 'dashboard' | 'auth' | 'account';

export default function App() {
  const [view, setView] = useState<View>(() => {
    const hash = window.location.hash.slice(1);
    return hash === 'dashboard' || hash === 'auth' || hash === 'account' ? hash : 'store';
  });
  const [session, setSession] = useState<Session | null>(null);
  const [accountType, setAccountType] = useState<string | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const isDriverAccount = accountType === 'DRIVER';
  const canAccessDashboard = accountType === 'ADMIN' || accountType === 'EMPLOYEE';
  const isCustomerAccount = accountType === 'CUSTOMER';
  const isStaff = canAccessDashboard || isDriverAccount;
  const { language, setLanguage, t } = useTranslation();

  useEffect(() => {
    void getPublicSettings().then((s) => setMaintenanceMode(s['system.maintenance_mode']));
  }, []);

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.slice(1);
      setView(hash === 'dashboard' || hash === 'auth' || hash === 'account' ? hash : 'store');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) {
        const { data: profile } = await supabase.from('profiles').select('account_type').eq('id', data.session.user.id).maybeSingle();
        setAccountType(profile?.account_type ?? null);
      }
    };
    void loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setAccountType(null);
        return;
      }
      void supabase.from('profiles').select('account_type').eq('id', nextSession.user.id).maybeSingle().then(({ data }) => setAccountType(data?.account_type ?? null));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const navigate = useCallback((v: View) => {
    window.location.hash = v;
    setView(v);
    setNavOpen(false);
  }, []);

  const handleDashboardLogout = useCallback(async () => {
    await supabase.auth.signOut();
    navigate('auth');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-sand-50">
      {/* Compact floating menu: quick access to store / language / dashboard-account-deliveries */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {navOpen && (
          <div className="flex flex-col items-end gap-2 animate-slide-up">
            <button
              onClick={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
              className="w-11 h-11 rounded-full shadow-lg bg-white text-sand-700 hover:bg-sand-100 flex items-center justify-center text-xs font-bold"
              title="Changer de langue / Switch language"
            >
              {language === 'fr' ? 'EN' : 'FR'}
            </button>
            <button
              onClick={() => navigate('store')}
              className={`flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-colors ${view === 'store' ? 'bg-ocre-600 text-white' : 'bg-white text-sand-700 hover:bg-sand-100'}`}
              title={t('nav.store')}
            >
              <Store className="w-5 h-5" />
              <span className="text-sm font-medium whitespace-nowrap">{t('nav.store')}</span>
            </button>
            {isCustomerAccount ? (
              <button
                onClick={() => navigate('account')}
                className={`flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-colors ${view === 'account' ? 'bg-indigo-700 text-white' : 'bg-white text-sand-700 hover:bg-sand-100'}`}
                title={t('nav.account')}
              >
                <User className="w-5 h-5" />
                <span className="text-sm font-medium whitespace-nowrap">{t('nav.account')}</span>
              </button>
            ) : isDriverAccount ? (
              <button
                onClick={() => navigate('dashboard')}
                className={`flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-colors ${view === 'dashboard' ? 'bg-indigo-700 text-white' : 'bg-white text-sand-700 hover:bg-sand-100'}`}
                title={t('nav.deliveries')}
              >
                <Truck className="w-5 h-5" />
                <span className="text-sm font-medium whitespace-nowrap">{t('nav.deliveries')}</span>
              </button>
            ) : (
              <button
                onClick={() => navigate(session && canAccessDashboard ? 'dashboard' : 'auth')}
                className={`flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-colors ${view === 'dashboard' ? 'bg-indigo-700 text-white' : 'bg-white text-sand-700 hover:bg-sand-100'}`}
                title={t('nav.dashboard')}
              >
                <LayoutDashboard className="w-5 h-5" />
                <span className="text-sm font-medium whitespace-nowrap">{t('nav.dashboard')}</span>
              </button>
            )}
          </div>
        )}
        <button
          onClick={() => setNavOpen((o) => !o)}
          className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors ${navOpen ? 'bg-sand-900 text-white' : 'bg-ocre-600 text-white hover:bg-ocre-700'}`}
          title={navOpen ? 'Fermer le menu' : 'Menu'}
        >
          {navOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {navOpen && <div className="fixed inset-0 z-40" onClick={() => setNavOpen(false)} />}

      {view === 'store' && (maintenanceMode && !isStaff ? <MaintenanceScreen /> : <StoreFront />)}
      {view === 'auth' && <AuthPage onBack={() => navigate('store')} />}
      {view === 'account' && (session && isCustomerAccount ? <MyAccountPage onBack={() => navigate('store')} /> : <AuthPage onBack={() => navigate('store')} />)}
      {view === 'dashboard' && session && isDriverAccount && <DriverPage onBack={() => navigate('store')} />}
      {view === 'dashboard' && (!session || !isDriverAccount) && (session && canAccessDashboard ? <Dashboard onLogout={handleDashboardLogout} /> : <AuthPage onBack={() => navigate('store')} />)}
    </div>
  );
}
