import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Search, Printer, Eye, ChevronDown, ChevronRight, RotateCcw, ExternalLink,
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/taxCalc';
import {
  buildSalesHistoryRows,
  DEFAULT_SALES_HISTORY_FILTERS,
  salesChannelLabel,
  type SalesHistoryDatePreset,
  type SalesHistoryFilters,
} from '@/lib/salesHistory';
import { PAYMENT_METHODS } from '@/constants/config';
import SalesSectionNav from '@/components/features/SalesSectionNav';
import SalesInvoiceDialog from '@/components/features/SalesInvoiceDialog';
import type { SaleTransaction } from '@/types';

const PAGE_SIZE = 50;

function statusBadgeClass(status: string): string {
  if (status === 'Completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Partially Returned') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Voided') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-secondary text-muted-foreground';
}

function returnBadgeClass(status: string): string {
  if (status === 'Returned') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Partially Returned') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

const DATE_PRESETS: { value: SalesHistoryDatePreset; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom' },
];

export default function SalesHistoryPage() {
  const navigate = useNavigate();
  const pos = usePosStore();
  const { employees, store, employee, hasPermission } = useAuthStore();
  const canStartReturn = hasPermission('returns');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<SalesHistoryFilters>(DEFAULT_SALES_HISTORY_FILTERS);

  const [invoiceSale, setInvoiceSale] = useState<SaleTransaction | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 180);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debounced, filters]);

  const employeesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees) map.set(emp.id, emp.fullName);
    return map;
  }, [employees]);

  const rows = useMemo(() => buildSalesHistoryRows({
    sales: pos.sales,
    saleItems: pos.saleItems,
    salePayments: pos.salePayments,
    inventory: pos.inventory,
    customers: pos.customers,
    returns: pos.returns,
    employeesById,
    storeId: store?.id || pos.activeStoreId || 'STR-001',
  }, debounced, filters), [
    pos.sales, pos.saleItems, pos.salePayments, pos.inventory, pos.customers, pos.returns,
    pos.activeStoreId, employeesById, store?.id, debounced, filters,
  ]);

  const employeeOptions = useMemo(() => {
    const ids = new Set(pos.sales.filter((s) => s.status !== 'draft').map((s) => s.employeeId));
    return employees.filter((emp) => ids.has(emp.id));
  }, [pos.sales, employees]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const invoiceSaleItems = useMemo(
    () => (invoiceSale ? pos.saleItems.filter((i) => i.salesTransactionId === invoiceSale.id) : []),
    [pos.saleItems, invoiceSale],
  );
  const invoiceSalePayments = useMemo(
    () => (invoiceSale ? pos.salePayments.filter((p) => p.transactionId === invoiceSale.id) : []),
    [pos.salePayments, invoiceSale],
  );
  const invoiceCustomer = invoiceSale?.customerId
    ? pos.customers.find((c) => c.id === invoiceSale.customerId)
    : null;

  const handleReprint = (sale: SaleTransaction) => {
    setInvoiceSale(sale);
    setShowInvoice(true);
  };

  const handleInvoicePrint = () => {
    if (invoiceSale && employee) {
      pos.logAction(employee.id, employee.fullName, 'Sales', 'INVOICE_PRINT', 'sale', invoiceSale.id,
        `Invoice printed for ${invoiceSale.saleCode} — ${formatCurrency(invoiceSale.totalAmount)}`);
    }
  };

  const updateFilter = (patch: Partial<SalesHistoryFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Sales History</h1>
          <p className="text-sm text-muted-foreground">Review completed sales, reprint receipts, and start returns</p>
        </div>
        <SalesSectionNav />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {DATE_PRESETS.map((preset) => (
          <Button
            key={preset.value}
            size="sm"
            variant={filters.datePreset === preset.value ? 'default' : 'outline'}
            className="h-8 text-[11px]"
            onClick={() => updateFilter({ datePreset: preset.value })}
          >
            {preset.label}
          </Button>
        ))}
        {filters.datePreset === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <Input
              type="date"
              value={filters.customFrom || ''}
              onChange={(e) => updateFilter({ customFrom: e.target.value })}
              className="h-8 w-[150px] text-[11px]"
            />
            <span className="text-[11px] text-muted-foreground">to</span>
            <Input
              type="date"
              value={filters.customTo || ''}
              onChange={(e) => updateFilter({ customTo: e.target.value })}
              className="h-8 w-[150px] text-[11px]"
            />
          </div>
        )}
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
          placeholder="Search sale ID, customer, phone, email, product, brand, model, device ID, IMEI, serial, SKU, barcode, or employee…"
          className="h-12 pl-11 text-[14px]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filters.employeeId || 'all'} onValueChange={(v) => updateFilter({ employeeId: v === 'all' ? undefined : v })}>
          <SelectTrigger className="h-8 w-[180px] text-[11px]"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employeeOptions.map((emp) => (
              <SelectItem key={emp.id} value={emp.id}>{emp.fullName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.paymentMethod || 'all'} onValueChange={(v) => updateFilter({ paymentMethod: v === 'all' ? undefined : v })}>
          <SelectTrigger className="h-8 w-[180px] text-[11px]"><SelectValue placeholder="Payment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.saleStatus || 'all'} onValueChange={(v) => updateFilter({ saleStatus: v === 'all' ? undefined : v })}>
          <SelectTrigger className="h-8 w-[180px] text-[11px]"><SelectValue placeholder="Sale Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="partially-returned">Partially Returned</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.returnStatus || 'all'} onValueChange={(v) => updateFilter({ returnStatus: v === 'all' ? undefined : v })}>
          <SelectTrigger className="h-8 w-[200px] text-[11px]"><SelectValue placeholder="Return Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Return Statuses</SelectItem>
            <SelectItem value="No Return">No Return</SelectItem>
            <SelectItem value="Partially Returned">Partially Returned</SelectItem>
            <SelectItem value="Returned">Returned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="text-[11px]">Sale ID</TableHead>
                <TableHead className="text-[11px]">Channel</TableHead>
                <TableHead className="text-[11px]">Sale Date / Time</TableHead>
                <TableHead className="text-[11px]">Customer Name</TableHead>
                <TableHead className="text-[11px] text-right">Items</TableHead>
                <TableHead className="text-[11px]">Product Summary</TableHead>
                <TableHead className="text-[11px] text-right">Qty Sold</TableHead>
                <TableHead className="text-[11px] text-right">Subtotal</TableHead>
                <TableHead className="text-[11px] text-right">Tax</TableHead>
                <TableHead className="text-[11px] text-right">Total</TableHead>
                <TableHead className="text-[11px]">Payment</TableHead>
                <TableHead className="text-[11px]">Employee</TableHead>
                <TableHead className="text-[11px]">Status</TableHead>
                <TableHead className="text-[11px]">Return</TableHead>
                <TableHead className="text-[11px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => {
                const expanded = expandedId === row.sale.id;
                const customer = row.customer;
                return (
                  <Fragment key={row.sale.id}>
                    <TableRow className="align-top">
                      <TableCell className="pr-0">
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-secondary"
                          onClick={() => setExpandedId(expanded ? null : row.sale.id)}
                          aria-label={expanded ? 'Hide sale details' : 'View sale details'}
                        >
                          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-[12px] font-semibold text-primary whitespace-nowrap">
                        {row.sale.saleCode}
                      </TableCell>
                      <TableCell className="text-[12px] whitespace-nowrap">
                        <Badge variant="outline" className="text-[9px]">{salesChannelLabel(row.sale.salesChannel)}</Badge>
                        {row.sale.shopifyOrderName && (
                          <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{row.sale.shopifyOrderName}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-[12px] whitespace-nowrap">{formatDateTime(row.saleAt)}</TableCell>
                      <TableCell className="text-[12px] font-medium">
                        {customer
                          ? `${customer.firstName} ${customer.lastName}`
                          : row.sale.shopifyCustomerName || (row.sale.salesChannel === 'shopify' ? (row.sale.shopifyCustomerEmail || 'Shopify customer') : 'Walk-in')}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{row.itemCount}</TableCell>
                      <TableCell className="text-[12px] max-w-[220px] truncate">{row.productSummary}</TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{row.quantitySold}</TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{formatCurrency(row.sale.subtotal)}</TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{formatCurrency(row.sale.taxTotal)}</TableCell>
                      <TableCell className="text-right font-mono text-[12px] font-semibold">{formatCurrency(row.sale.totalAmount)}</TableCell>
                      <TableCell className="text-[11px]">{row.paymentMethods.join(', ') || '—'}</TableCell>
                      <TableCell className="text-[12px]">{row.employeeName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[9px] ${statusBadgeClass(row.statusLabel)}`}>{row.statusLabel}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[9px] ${returnBadgeClass(row.returnStatus)}`}>{row.returnStatus}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5 flex-wrap">
                          <Button size="sm" variant="outline" className="h-7 text-[10px]"
                            onClick={() => setExpandedId(expanded ? null : row.sale.id)}>
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
                              onClick={() => handleReprint(row.sale)}>
                              <Printer className="size-3 mr-1" />Reprint Receipt
                            </Button>
                          )}
                          {row.sale.shopifyOrderUrl && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px]" asChild>
                              <a href={row.sale.shopifyOrderUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="size-3 mr-1" />Open Shopify Order
                              </a>
                            </Button>
                          )}
                          {canStartReturn && row.canReturn && (
                            <Button size="sm" className="h-7 text-[10px]"
                              onClick={() => navigate(`/pos/returns?saleId=${encodeURIComponent(row.sale.id)}`)}>
                              <RotateCcw className="size-3 mr-1" />Start Return
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={16} className="bg-secondary/40 p-4">
                          <p className="text-[12px] font-semibold mb-2">Items sold on this transaction</p>
                          {row.items.length === 0 ? (
                            <p className="text-[12px] text-muted-foreground">No line items recorded for this sale.</p>
                          ) : (
                            <div className="overflow-x-auto rounded-md border bg-background">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-[10px]">Product Name</TableHead>
                                    <TableHead className="text-[10px]">Brand</TableHead>
                                    <TableHead className="text-[10px]">Model</TableHead>
                                    <TableHead className="text-[10px]">Device ID</TableHead>
                                    <TableHead className="text-[10px]">IMEI</TableHead>
                                    <TableHead className="text-[10px]">Serial Number</TableHead>
                                    <TableHead className="text-[10px]">SKU / Barcode</TableHead>
                                    <TableHead className="text-[10px] text-right">Quantity Sold</TableHead>
                                    <TableHead className="text-[10px] text-right">Unit Price</TableHead>
                                    <TableHead className="text-[10px] text-right">Line Total</TableHead>
                                    <TableHead className="text-[10px]">Inventory Status</TableHead>
                                    <TableHead className="text-[10px]">Return Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {row.items.map((line) => (
                                    <TableRow key={line.item.id}>
                                      <TableCell className="text-[11px]">{line.productName || '—'}</TableCell>
                                      <TableCell className="text-[11px]">{line.item.brand || '—'}</TableCell>
                                      <TableCell className="text-[11px]">{line.item.model || '—'}</TableCell>
                                      <TableCell className="font-mono text-[11px]">{line.deviceId || '—'}</TableCell>
                                      <TableCell className="font-mono text-[11px]">{line.imei || '—'}</TableCell>
                                      <TableCell className="font-mono text-[11px]">{line.serialNumber || '—'}</TableCell>
                                      <TableCell className="font-mono text-[11px]">{line.skuBarcode || '—'}</TableCell>
                                      <TableCell className="text-right font-mono text-[11px]">{line.item.quantity}</TableCell>
                                      <TableCell className="text-right font-mono text-[11px]">{formatCurrency(line.item.unitPrice)}</TableCell>
                                      <TableCell className="text-right font-mono text-[11px]">{formatCurrency(line.item.lineTotal)}</TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className="text-[9px]">{line.inventoryStatus}</Badge>
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className={`text-[9px] ${returnBadgeClass(line.lineReturnStatus)}`}>
                                          {line.lineReturnStatus}
                                        </Badge>
                                      </TableCell>
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
                  <TableCell colSpan={15} className="text-center py-10 text-[12px] text-muted-foreground">
                    {debounced || filters.datePreset !== 'all' || filters.employeeId || filters.paymentMethod || filters.saleStatus || filters.returnStatus
                      ? 'No sales match that search or filter.'
                      : 'No completed sales found for this store.'}
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

      <SalesInvoiceDialog
        open={showInvoice}
        onOpenChange={setShowInvoice}
        sale={invoiceSale}
        saleItems={invoiceSaleItems}
        salePayments={invoiceSalePayments}
        customer={invoiceCustomer}
        onPrint={handleInvoicePrint}
      />
    </div>
  );
}
