import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Search, Users, Calendar, Package, ShoppingCart, DollarSign, Eye, ArrowRight,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/taxCalc';
import { buildCustomerListRows, storewideCustomerKpis } from '@/lib/customerSearch';

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const navigate = useNavigate();
  const pos = usePosStore();
  const { hasPermission } = useAuthStore();
  const canStartVisit = hasPermission('customer');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 180);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debounced]);

  const searchInput = useMemo(() => ({
    customers: pos.customers,
    visits: pos.visits,
    purchases: pos.purchases,
    purchaseItems: pos.purchaseItems,
    inventory: pos.inventory,
    sales: pos.sales,
    saleItems: pos.saleItems,
    returns: pos.returns,
  }), [
    pos.customers, pos.visits, pos.purchases, pos.purchaseItems,
    pos.inventory, pos.sales, pos.saleItems, pos.returns,
  ]);

  const kpis = useMemo(() => storewideCustomerKpis(searchInput), [searchInput]);
  const rows = useMemo(() => buildCustomerListRows(searchInput, debounced), [searchInput, debounced]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const cards = [
    { label: 'Total Customers', value: String(kpis.totalCustomers), icon: Users, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Customers This Month', value: String(kpis.customersThisMonth), icon: Calendar, color: 'text-blue-600 bg-blue-50' },
    { label: 'Total Devices Purchased', value: String(kpis.devicesPurchased), icon: Package, color: 'text-amber-600 bg-amber-50' },
    { label: 'Total Devices Sold', value: String(kpis.devicesSold), icon: ShoppingCart, color: 'text-teal-600 bg-teal-50' },
    { label: 'Total Lifetime Purchase Value', value: formatCurrency(kpis.lifetimePurchaseValue), icon: DollarSign, color: 'text-purple-600 bg-purple-50' },
  ];

  const startVisit = (customerId: string) => {
    navigate(`/pos/customer?customerId=${encodeURIComponent(customerId)}&t=${Date.now()}`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Customer Management</h1>
        <p className="text-sm text-muted-foreground">Search and review complete customer history</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-[11px] font-medium text-muted-foreground leading-tight pr-2">{card.label}</p>
                  <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${card.color}`}>
                    <Icon className="size-4" />
                  </div>
                </div>
                <p className="text-xl font-bold font-mono tabular-nums">{card.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setDebounced(search.trim());
          }}
          placeholder="Search name, phone, email, ID, device, IMEI, serial, visit, sale, or purchase…"
          className="h-12 pl-11 text-[14px]"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Customer Name</TableHead>
                <TableHead className="text-[11px]">Phone</TableHead>
                <TableHead className="text-[11px]">Email</TableHead>
                <TableHead className="text-[11px]">Customer Since</TableHead>
                <TableHead className="text-[11px] text-right">Total Visits</TableHead>
                <TableHead className="text-[11px] text-right">Devices Purchased From Customer</TableHead>
                <TableHead className="text-[11px] text-right">Devices Sold To Customer</TableHead>
                <TableHead className="text-[11px] text-right">Total Paid To Customer</TableHead>
                <TableHead className="text-[11px] text-right">Total Customer Spend</TableHead>
                <TableHead className="text-[11px]">Last Visit</TableHead>
                <TableHead className="text-[11px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => {
                const c = row.customer;
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/pos/customers/${c.id}`)}>
                    <TableCell>
                      <div className="font-semibold text-[13px]">{c.firstName} {c.lastName}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{c.customerCode}</div>
                    </TableCell>
                    <TableCell className="text-[12px] font-mono">{c.phone || '—'}</TableCell>
                    <TableCell className="text-[12px] max-w-[160px] truncate">{c.email || '—'}</TableCell>
                    <TableCell className="text-[12px]">{formatDate(c.createdAt)}</TableCell>
                    <TableCell className="text-right font-mono text-[12px]">{row.visitCount}</TableCell>
                    <TableCell className="text-right font-mono text-[12px]">{row.devicesPurchasedFromCustomer}</TableCell>
                    <TableCell className="text-right font-mono text-[12px]">{row.devicesSoldToCustomer}</TableCell>
                    <TableCell className="text-right font-mono text-[12px]">{formatCurrency(row.totalPaidToCustomer)}</TableCell>
                    <TableCell className="text-right font-mono text-[12px]">{formatCurrency(row.totalCustomerSpend)}</TableCell>
                    <TableCell className="text-[12px]">{formatDate(row.lastVisitAt)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => navigate(`/pos/customers/${c.id}`)}>
                          <Eye className="size-3 mr-1" />View Profile
                        </Button>
                        {canStartVisit && (
                          <Button size="sm" className="h-7 text-[10px]" onClick={() => startVisit(c.id)}>
                            <ArrowRight className="size-3 mr-1" />Start New Visit
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-10 text-[12px] text-muted-foreground">
                    {debounced ? 'No customers match that search.' : 'No customers found for this store.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <p>
          Showing {pageRows.length === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min(rows.length, (page + 1) * PAGE_SIZE)} of {rows.length}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button size="sm" variant="outline" className="h-7" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
