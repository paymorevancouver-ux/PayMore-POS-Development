import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Search, Printer, Eye, ChevronDown, ChevronRight, ArrowLeftRight,
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/taxCalc';
import { buildVisitHistoryRows } from '@/lib/visitHistory';
import CustomersSectionNav from '@/components/features/CustomersSectionNav';
import BookLabelDialog from '@/components/features/BookLabelDialog';
import EmployeeVerificationDialog from '@/components/features/EmployeeVerificationDialog';
import { useStartBuyTrade } from '@/hooks/useStartBuyTrade';
import { useToast } from '@/hooks/use-toast';
import type { Customer, CustomerVisit, PurchaseItem, PurchaseTransaction } from '@/types';

const PAGE_SIZE = 50;

function statusBadgeClass(status: string): string {
  if (status === 'Completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'In Progress') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Voided') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-secondary text-muted-foreground';
}

export default function CustomerVisitHistoryPage() {
  const navigate = useNavigate();
  const pos = usePosStore();
  const { employees, store, employee, hasPermission } = useAuthStore();
  const { toast } = useToast();
  const canStartVisit = hasPermission('customer');
  const { pinOpen, setPinOpen, startBuyTrade, onVerified } = useStartBuyTrade();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [reprintCustomer, setReprintCustomer] = useState<Customer | null>(null);
  const [reprintVisit, setReprintVisit] = useState<CustomerVisit | null>(null);
  const [reprintPurchase, setReprintPurchase] = useState<PurchaseTransaction | null>(null);
  const [reprintItems, setReprintItems] = useState<PurchaseItem[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 180);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debounced]);

  const employeesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees) map.set(emp.id, emp.fullName);
    return map;
  }, [employees]);

  const rows = useMemo(() => buildVisitHistoryRows({
    visits: pos.visits,
    customers: pos.customers,
    purchases: pos.purchases,
    purchaseItems: pos.purchaseItems,
    purchasePayments: pos.purchasePayments,
    inventory: pos.inventory,
    employeesById,
    storeId: store?.id || pos.activeStoreId || 'STR-001',
  }, debounced), [
    pos.visits, pos.customers, pos.purchases, pos.purchaseItems, pos.purchasePayments,
    pos.inventory, pos.activeStoreId, employeesById, store?.id, debounced,
  ]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleReprint = (visit: CustomerVisit, customer: Customer | undefined, purchase: PurchaseTransaction | undefined, items: PurchaseItem[]) => {
    if (!customer || !purchase) {
      toast({ variant: 'destructive', title: 'Cannot reprint', description: 'This visit does not have a completed purchase yet.' });
      return;
    }
    setReprintCustomer(customer);
    setReprintVisit(visit);
    setReprintPurchase(purchase);
    setReprintItems(items);
  };

  const handleReprintConfirm = () => {
    if (!reprintVisit) return;
    const actorId = employee?.id;
    if (!actorId) return;
    pos.printLabel(reprintVisit.id, actorId);
    toast({ title: 'Book label printed', description: `Visit ${reprintVisit.visitCode}` });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Customer Visit History</h1>
          <p className="text-sm text-muted-foreground">Review Buy / Trade visits, devices, and reprint book labels</p>
        </div>
        <CustomersSectionNav />
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
          placeholder="Search visit ID, customer, phone, email, ID number, device ID, IMEI, serial, brand, model, or purchase ID…"
          className="h-12 pl-11 text-[14px]"
        />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="text-[11px]">Visit ID</TableHead>
                <TableHead className="text-[11px]">Customer Name</TableHead>
                <TableHead className="text-[11px]">Customer ID</TableHead>
                <TableHead className="text-[11px]">ID Number</TableHead>
                <TableHead className="text-[11px]">Visit Date</TableHead>
                <TableHead className="text-[11px]">Employee</TableHead>
                <TableHead className="text-[11px] text-right">Devices</TableHead>
                <TableHead className="text-[11px] text-right">Purchase Amount</TableHead>
                <TableHead className="text-[11px]">Payment</TableHead>
                <TableHead className="text-[11px]">Status</TableHead>
                <TableHead className="text-[11px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => {
                const expanded = expandedId === row.visit.id;
                const customer = row.customer;
                return (
                  <Fragment key={row.visit.id}>
                    <TableRow className="align-top">
                      <TableCell className="pr-0">
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-secondary"
                          onClick={() => setExpandedId(expanded ? null : row.visit.id)}
                          aria-label={expanded ? 'Hide visit details' : 'View visit details'}
                        >
                          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-[12px] font-semibold text-primary">{row.visit.visitCode}</TableCell>
                      <TableCell className="text-[12px] font-medium">
                        {customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown'}
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">{customer?.customerCode || '—'}</TableCell>
                      <TableCell className="font-mono text-[11px]">{customer?.idNumber || '—'}</TableCell>
                      <TableCell className="text-[12px] whitespace-nowrap">{formatDateTime(row.visit.createdAt)}</TableCell>
                      <TableCell className="text-[12px]">{row.employeeName}</TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{row.deviceCount}</TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{formatCurrency(row.purchaseAmount)}</TableCell>
                      <TableCell className="text-[11px]">{row.paymentMethods.join(', ') || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[9px] ${statusBadgeClass(row.status)}`}>{row.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5 flex-wrap">
                          <Button size="sm" variant="outline" className="h-7 text-[10px]"
                            onClick={() => setExpandedId(expanded ? null : row.visit.id)}>
                            {expanded ? 'Hide Details' : 'View Details'}
                          </Button>
                          {customer && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px]"
                              onClick={() => navigate(`/pos/customers/${customer.id}`)}>
                              <Eye className="size-3 mr-1" />View Customer
                            </Button>
                          )}
                          {row.canReprint && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px]"
                              onClick={() => handleReprint(row.visit, customer, row.purchase, row.devices.map((d) => d.item))}>
                              <Printer className="size-3 mr-1" />Reprint Label
                            </Button>
                          )}
                          {canStartVisit && customer && (
                            <Button size="sm" className="h-7 text-[10px]" onClick={() => startBuyTrade(customer.id)}>
                              <ArrowLeftRight className="size-3 mr-1" />Start New Buy / Trade
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={12} className="bg-secondary/40 p-4">
                          <p className="text-[12px] font-semibold mb-2">Devices on this visit</p>
                          {row.devices.length === 0 ? (
                            <p className="text-[12px] text-muted-foreground">No devices recorded for this visit.</p>
                          ) : (
                            <div className="overflow-x-auto rounded-md border bg-background">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-[10px]">Device ID</TableHead>
                                    <TableHead className="text-[10px]">Product</TableHead>
                                    <TableHead className="text-[10px]">Brand</TableHead>
                                    <TableHead className="text-[10px]">Model</TableHead>
                                    <TableHead className="text-[10px]">Category</TableHead>
                                    <TableHead className="text-[10px]">IMEI</TableHead>
                                    <TableHead className="text-[10px]">Serial Number</TableHead>
                                    <TableHead className="text-[10px]">Color</TableHead>
                                    <TableHead className="text-[10px] text-right">Qty</TableHead>
                                    <TableHead className="text-[10px] text-right">Estimated Value</TableHead>
                                    <TableHead className="text-[10px] text-right">Offer Price</TableHead>
                                    <TableHead className="text-[10px]">Staff Notes</TableHead>
                                    <TableHead className="text-[10px]">Inventory Status</TableHead>
                                    <TableHead className="text-[10px]">Location</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {row.devices.map((device) => (
                                    <TableRow key={device.item.id}>
                                      <TableCell className="font-mono text-[11px]">{device.deviceId}</TableCell>
                                      <TableCell className="text-[11px]">{device.product || '—'}</TableCell>
                                      <TableCell className="text-[11px]">{device.item.brand || '—'}</TableCell>
                                      <TableCell className="text-[11px]">{device.item.model || '—'}</TableCell>
                                      <TableCell className="text-[11px]">{device.item.category || '—'}</TableCell>
                                      <TableCell className="font-mono text-[11px]">{device.item.serialImei || device.inventory?.serialImei || '—'}</TableCell>
                                      <TableCell className="font-mono text-[11px]">{device.inventory?.serialImei || device.item.serialImei || '—'}</TableCell>
                                      <TableCell className="text-[11px]">—</TableCell>
                                      <TableCell className="text-right font-mono text-[11px]">{device.item.quantity}</TableCell>
                                      <TableCell className="text-right font-mono text-[11px]">{formatCurrency(device.item.estimatedSalePrice)}</TableCell>
                                      <TableCell className="text-right font-mono text-[11px]">{formatCurrency(device.item.buyPrice)}</TableCell>
                                      <TableCell className="text-[11px] max-w-[180px] truncate">{device.item.conditionNotes || '—'}</TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className="text-[9px]">{device.currentStatus}</Badge>
                                      </TableCell>
                                      <TableCell className="text-[11px]">{device.currentLocation || '—'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-10 text-[12px] text-muted-foreground">
                    {debounced ? 'No visits match that search.' : 'No customer visits found for this store.'}
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

      <BookLabelDialog
        open={!!reprintVisit}
        onOpenChange={(open) => { if (!open) setReprintVisit(null); }}
        customer={reprintCustomer}
        visit={reprintVisit}
        purchase={reprintPurchase}
        purchaseItems={reprintItems}
        labelLog={reprintVisit ? pos.labels.find((l) => l.visitId === reprintVisit.id) : undefined}
        onPrint={handleReprintConfirm}
      />

      <EmployeeVerificationDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        onVerified={onVerified}
      />
    </div>
  );
}
