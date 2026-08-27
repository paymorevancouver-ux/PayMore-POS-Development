import { useLocation, useNavigate } from 'react-router-dom';

const TABS = [
  { path: '/pos/sales', label: 'New Sale' },
  { path: '/pos/sales/history', label: 'Sales History' },
];

export default function SalesSectionNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
      {TABS.map((tab) => {
        const active = tab.path === '/pos/sales/history'
          ? location.pathname === '/pos/sales/history'
          : location.pathname === '/pos/sales';
        return (
          <button
            key={tab.path}
            type="button"
            onClick={() => navigate(tab.path)}
            className={`h-8 px-3 rounded-md text-[12px] font-semibold transition-colors ${
              active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
