import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppShell() {
  const { isAuthenticated, checkSessionTimeout } = useAuthStore();
  const { refreshCashDrawer, isLoaded } = usePosStore();
  const navigate = useNavigate();

  // Periodic session timeout check
  useEffect(() => {
    const interval = setInterval(() => {
      const timedOut = checkSessionTimeout();
      if (timedOut) {
        navigate('/login');
      }
    }, 60_000); // Check every minute
    return () => clearInterval(interval);
  }, [checkSessionTimeout, navigate]);

  // Poll cash drawer balance every 30 seconds for cross-terminal sync
  useEffect(() => {
    if (!isLoaded) return;
    const interval = setInterval(() => {
      refreshCashDrawer();
    }, 30_000);
    return () => clearInterval(interval);
  }, [isLoaded, refreshCashDrawer]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
