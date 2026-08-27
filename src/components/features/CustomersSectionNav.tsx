import { useLocation, useNavigate } from 'react-router-dom';

const TABS = [
  { path: '/pos/customers', label: 'Customer Management' },
  { path: '/pos/customers/visits', label: 'Customer Visit History' },
];

export default function CustomersSectionNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
      {TABS.map((tab) => {
        const active = tab.path === '/pos/customers/visits'
          ? location.pathname === '/pos/customers/visits'
          : location.pathname === '/pos/customers' || (
            location.pathname.startsWith('/pos/customers/') && location.pathname !== '/pos/customers/visits'
          );
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
