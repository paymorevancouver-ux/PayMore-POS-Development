import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Shield, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredModule?: string;
}

export default function ProtectedRoute({ children, requiredModule }: ProtectedRouteProps) {
  const { isAuthenticated, hasPermission, employee, touchActivity, checkSessionTimeout } = useAuthStore();
  const location = useLocation();

  // Session timeout check on route change
  useEffect(() => {
    if (isAuthenticated) {
      const timedOut = checkSessionTimeout();
      if (!timedOut) {
        touchActivity();
      }
    }
  }, [location.pathname]);

  // Activity tracking on user interaction
  useEffect(() => {
    if (!isAuthenticated) return;

    const handler = () => touchActivity();
    window.addEventListener('click', handler);
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredModule && !hasPermission(requiredModule)) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-112px)]">
        <div className="text-center max-w-sm">
          <div className="size-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="size-8 text-destructive" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Access Denied</h2>
          <p className="text-sm text-muted-foreground mb-1">
            You don't have permission to access <span className="font-semibold capitalize">{requiredModule}</span>.
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Your role: <span className="font-mono capitalize font-semibold">{employee?.role}</span>. Contact an admin if you need access.
          </p>
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
