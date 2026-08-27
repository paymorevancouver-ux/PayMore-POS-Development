import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, ContactRound, Landmark, Package, ShoppingCart, RotateCcw,
  ArrowRightLeft, FileEdit, BarChart3, Settings, ScrollText, LogOut,
  UserCog, Tag,
} from 'lucide-react';
import { formatCurrency } from '@/lib/taxCalc';

const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { path: '/pos/dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
      { path: '/pos/customer', label: 'Buy / Sell Visit', icon: Users, module: 'customer' },
      { path: '/pos/customers', label: 'Customers', icon: ContactRound, module: 'customer' },
      { path: '/pos/drawer', label: 'Cash Drawer', icon: Landmark, module: 'drawer' },
    ],
  },
  {
    label: 'Transactions',
    items: [
      { path: '/pos/inventory', label: 'Inventory', icon: Package, module: 'inventory' },
      { path: '/pos/sales', label: 'Sales', icon: ShoppingCart, module: 'sales' },
      { path: '/pos/returns', label: 'Returns', icon: RotateCcw, module: 'returns' },
    ],
  },
  {
    label: 'Corrections',
    items: [
      { path: '/pos/payment-changes', label: 'Payment Changes', icon: ArrowRightLeft, module: 'payment-changes' },
      { path: '/pos/purchase-changes', label: 'Purchase Changes', icon: FileEdit, module: 'purchase-changes' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { path: '/pos/labels', label: 'Label Generator', icon: Tag, module: 'labels' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { path: '/pos/reports', label: 'Reports', icon: BarChart3, module: 'reports' },
      { path: '/pos/users', label: 'User Management', icon: UserCog, module: 'users' },
      { path: '/pos/settings', label: 'Settings', icon: Settings, module: 'settings' },
      { path: '/pos/audit', label: 'Audit Logs', icon: ScrollText, module: 'audit' },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { employee, store, logout, hasPermission } = useAuthStore();
  const { cashDrawer } = usePosStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-[240px] shrink-0 bg-sidebar flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <span className="text-white font-extrabold text-sm tracking-tight">PM</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-[15px] leading-tight tracking-tight">PayMore</h1>
            <p className="text-sidebar-foreground text-[10px] leading-tight">Point of Sale</p>
          </div>
        </div>
      </div>

      {/* Store badge */}
      <div className="px-3 mb-2">
        <div className="rounded-md bg-white/[0.06] px-3 py-2">
          <p className="text-[10px] text-sidebar-foreground leading-none mb-0.5">Store</p>
          <p className="text-white text-[12px] font-semibold leading-tight truncate">{store?.name || '—'}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-1 overflow-y-auto space-y-3">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => hasPermission(item.module));
          if (visibleItems.length === 0) return null;
          return (
          <div key={section.label}>
            <p className="text-[9px] font-semibold text-sidebar-foreground/50 uppercase tracking-widest px-3 mb-1">{section.label}</p>
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const active = item.path === '/pos/customers'
                  ? location.pathname === '/pos/customers' || location.pathname.startsWith('/pos/customers/')
                  : location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`w-full flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-sidebar-primary text-white'
                        : 'text-sidebar-foreground hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <Icon className="size-[15px] shrink-0" />
                    <span className="truncate">{item.label}</span>

                  </button>
                );
              })}
            </div>
          </div>
        );
        })}
      </nav>

      {/* Drawer summary */}
      <div className="px-3 pb-1">
        <div className="rounded-md bg-white/[0.06] px-3 py-2">
          <div className="mb-0.5">
            <p className="text-[10px] text-sidebar-foreground">Cash Drawer</p>
          </div>
          <p className="text-white font-mono text-lg font-semibold tabular-nums">{formatCurrency(cashDrawer.currentBalance)}</p>
        </div>
      </div>

      {/* User */}
      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-full bg-sidebar-primary/30 flex items-center justify-center">
            <span className="text-sidebar-primary text-[10px] font-bold">
              {employee?.fullName.split(' ').map((n) => n[0]).join('')}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[12px] font-medium truncate">{employee?.fullName}</p>
            <p className="text-sidebar-foreground text-[10px] capitalize">{employee?.role}</p>
          </div>
          <button onClick={handleLogout} className="p-1.5 rounded-md text-sidebar-foreground hover:text-white hover:bg-white/10 transition-colors cursor-pointer" aria-label="Logout">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
