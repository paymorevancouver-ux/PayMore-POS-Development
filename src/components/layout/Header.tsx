import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Clock } from 'lucide-react';
import { useState, useEffect } from 'react';

const TITLES: Record<string, string> = {
  '/pos/dashboard': 'Dashboard',
  '/pos/customer': 'Buy / Trade',
  '/pos/customers': 'Customers',
  '/pos/customers/visits': 'Customer Visit History',
  '/pos/drawer': 'Cash Drawer',
  '/pos/inventory': 'Inventory Management',
  '/pos/sales': 'Sales',
  '/pos/returns': 'Returns',
  '/pos/payment-changes': 'Payment Changes',
  '/pos/purchase-changes': 'Purchase Changes',
  '/pos/reports': 'Reports',
  '/pos/settings': 'Settings',
  '/pos/audit': 'Audit Logs',
};

export default function Header() {
  const location = useLocation();
  const { store } = useAuthStore();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const title = TITLES[location.pathname]
    || (location.pathname.startsWith('/pos/customers/') ? 'Customers' : 'Paymore POS');

  return (
    <header className="h-[52px] bg-card border-b border-border flex items-center justify-between px-6 shrink-0">
      <h2 className="text-[16px] font-bold text-foreground">{title}</h2>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-md">
          <div className="size-2 rounded-full bg-primary animate-pulse" />
          <span className="text-[11px] font-semibold text-primary">{store?.name || 'No Store'}</span>
          <span className="text-[9px] font-mono text-primary/60">({store?.id})</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground text-[12px]">
          <Clock className="size-3.5" />
          <time className="font-mono tabular-nums">
            {time.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
            {' · '}
            {time.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
      </div>
    </header>
  );
}
