import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import { Toaster } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import AppShell from '@/components/layout/AppShell';
import ProtectedRoute from '@/components/features/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import IdUploadPage from '@/pages/IdUploadPage';
import DashboardPage from '@/pages/DashboardPage';
import CustomerVisitPage from '@/pages/CustomerVisitPage';
import CustomersPage from '@/pages/CustomersPage';
import CustomerVisitHistoryPage from '@/pages/CustomerVisitHistoryPage';
import CustomerProfilePage from '@/pages/CustomerProfilePage';
import CashDrawerPage from '@/pages/CashDrawerPage';
import InventoryPage from '@/pages/InventoryPage';
import LabelGeneratorPage from '@/pages/LabelGeneratorPage';
import SalesPage from '@/pages/SalesPage';
import SalesHistoryPage from '@/pages/SalesHistoryPage';
import ReturnsPage from '@/pages/ReturnsPage';
import PaymentChangesPage from '@/pages/PaymentChangesPage';
import PurchaseChangesPage from '@/pages/PurchaseChangesPage';
import ReportsPage from '@/pages/ReportsPage';
import SettingsPage from '@/pages/SettingsPage';
import AuditPage from '@/pages/AuditPage';
import UserManagementPage from '@/pages/UserManagementPage';
import ShopifyListerPage from '@/pages/ShopifyListerPage';
import ShopifyListingEditorPage from '@/pages/ShopifyListingEditorPage';
import { AlertCircle, Loader2 } from 'lucide-react';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, store, logout } = useAuthStore();
  const {
    isLoading,
    isLoaded,
    loadError,
    activeStoreId,
    loadStoreData,
  } = usePosStore();

  useEffect(() => {
    if (
      isAuthenticated &&
      store?.id &&
      !isLoading &&
      !loadError &&
      (!isLoaded || activeStoreId !== store.id)
    ) {
      void loadStoreData(store.id);
    }
  }, [
    isAuthenticated,
    store?.id,
    isLoading,
    isLoaded,
    loadError,
    activeStoreId,
    loadStoreData,
  ]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="size-10 text-destructive mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">Unable to load store data</h2>
          <p className="text-sm text-muted-foreground mb-6">{loadError}</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={() => store?.id && void loadStoreData(store.id)}>
              Retry
            </Button>
            <Button variant="outline" onClick={() => logout()}>
              Log Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading while store data is being fetched from DB
  if (isLoading || !isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="size-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Loading store data...</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">Connecting to database</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/id-upload/:token" element={<IdUploadPage />} />
        <Route path="/shopify-lister" element={<Navigate to="/pos/shopify-lister" replace />} />
        <Route
          path="/pos"
          element={
            <AuthGate>
              <AppShell />
            </AuthGate>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ProtectedRoute requiredModule="dashboard"><DashboardPage /></ProtectedRoute>} />
          <Route path="customer" element={<ProtectedRoute requiredModule="customer"><CustomerVisitPage /></ProtectedRoute>} />
          <Route path="customers" element={<ProtectedRoute requiredModule="customer"><CustomersPage /></ProtectedRoute>} />
          <Route path="customers/visits" element={<ProtectedRoute requiredModule="customer"><CustomerVisitHistoryPage /></ProtectedRoute>} />
          <Route path="customers/:customerId" element={<ProtectedRoute requiredModule="customer"><CustomerProfilePage /></ProtectedRoute>} />
          <Route path="drawer" element={<ProtectedRoute requiredModule="drawer"><CashDrawerPage /></ProtectedRoute>} />
          <Route path="inventory" element={<ProtectedRoute requiredModule="inventory"><InventoryPage /></ProtectedRoute>} />
          <Route path="shopify-lister" element={<ProtectedRoute requiredModule="shopify-lister"><ShopifyListerPage /></ProtectedRoute>} />
          <Route path="shopify-lister/:listingId" element={<ProtectedRoute requiredModule="shopify-lister"><ShopifyListingEditorPage /></ProtectedRoute>} />
          <Route path="labels" element={<ProtectedRoute requiredModule="labels"><LabelGeneratorPage /></ProtectedRoute>} />
          <Route path="sales" element={<ProtectedRoute requiredModule="sales"><SalesPage /></ProtectedRoute>} />
          <Route path="sales/history" element={<ProtectedRoute requiredModule="sales"><SalesHistoryPage /></ProtectedRoute>} />
          <Route path="returns" element={<ProtectedRoute requiredModule="returns"><ReturnsPage /></ProtectedRoute>} />
          <Route path="payment-changes" element={<ProtectedRoute requiredModule="payment-changes"><PaymentChangesPage /></ProtectedRoute>} />
          <Route path="purchase-changes" element={<ProtectedRoute requiredModule="purchase-changes"><PurchaseChangesPage /></ProtectedRoute>} />
          <Route path="reports" element={<ProtectedRoute requiredModule="reports"><ReportsPage /></ProtectedRoute>} />
          <Route path="settings" element={<ProtectedRoute requiredModule="settings"><SettingsPage /></ProtectedRoute>} />
          <Route path="audit" element={<ProtectedRoute requiredModule="audit"><AuditPage /></ProtectedRoute>} />
          <Route path="users" element={<ProtectedRoute requiredModule="users"><UserManagementPage /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
