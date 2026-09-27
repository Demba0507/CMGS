import { useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { PermissionsProvider } from '@/lib/permissions';
import { ConfirmProvider } from '@/lib/confirm';
import { ToastProvider } from '@/lib/toast';
import DashboardHome from '@/pages/dashboard/DashboardHome';
import ProductsPage from '@/pages/dashboard/ProductsPage';
import CategoriesPage from '@/pages/dashboard/CategoriesPage';
import SuppliersPage from '@/pages/dashboard/SuppliersPage';
import CustomersPage from '@/pages/dashboard/CustomersPage';
import EmployeesPage from '@/pages/dashboard/EmployeesPage';
import OrdersPage from '@/pages/dashboard/OrdersPage';
import PaymentsPage from '@/pages/dashboard/PaymentsPage';
import DeliveriesPage from '@/pages/dashboard/DeliveriesPage';
import DriversPage from '@/pages/dashboard/DriversPage';
import ConversationsPage from '@/pages/dashboard/ConversationsPage';
import ComplaintsPage from '@/pages/dashboard/ComplaintsPage';
import ReturnsPage from '@/pages/dashboard/ReturnsPage';
import SimulatorPage from '@/pages/dashboard/SimulatorPage';
import NotificationsPage from '@/pages/dashboard/NotificationsPage';
import StatsPage from '@/pages/dashboard/StatsPage';
import LogsPage from '@/pages/dashboard/LogsPage';
import MaintenancePage from '@/pages/dashboard/MaintenancePage';
import SettingsPage from '@/pages/dashboard/SettingsPage';
import HeroSlidesPage from '@/pages/dashboard/HeroSlidesPage';
import TrashOverviewPage from '@/pages/dashboard/TrashOverviewPage';
import { IdleLogoutGuard } from '@/lib/idleLogout';

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [page, setPage] = useState('dashboard');
  const navigate = useCallback((id: string) => setPage(id), []);

  return (
    <PermissionsProvider>
    <ToastProvider>
    <ConfirmProvider>
    <IdleLogoutGuard onLogout={onLogout} />
    <DashboardLayout active={page} onNavigate={navigate} onLogout={onLogout}>
      {page === 'dashboard' && <DashboardHome onNavigate={navigate} />}
      {page === 'products' && <ProductsPage />}
      {page === 'categories' && <CategoriesPage />}
      {page === 'suppliers' && <SuppliersPage />}
      {page === 'customers' && <CustomersPage />}
      {page === 'employees' && <EmployeesPage />}
      {page === 'orders' && <OrdersPage />}
      {page === 'payments' && <PaymentsPage />}
      {page === 'deliveries' && <DeliveriesPage />}
      {page === 'drivers' && <DriversPage />}
      {page === 'conversations' && <ConversationsPage />}
      {page === 'complaints' && <ComplaintsPage />}
      {page === 'returns' && <ReturnsPage />}
      {page === 'simulator' && <SimulatorPage />}
      {page === 'notifications' && <NotificationsPage />}
      {page === 'stats' && <StatsPage />}
      {page === 'logs' && <LogsPage />}
      {page === 'maintenance' && <MaintenancePage />}
      {page === 'settings' && <SettingsPage />}
      {page === 'hero-slides' && <HeroSlidesPage />}
      {page === 'trash' && <TrashOverviewPage onNavigate={navigate} />}
    </DashboardLayout>
    </ConfirmProvider>
    </ToastProvider>
    </PermissionsProvider>
  );
}
