import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Search, RotateCcw, CheckCircle, ShoppingCart, Package, DollarSign,
  AlertTriangle, Clock, Hash, User, CreditCard, FileText, ChevronRight,
  ArrowLeft, Receipt, Eye, History, ScanLine,
} from 'lucide-react';
import { formatCurrency, formatDateTime, formatDate } from '@/lib/taxCalc';
import {
  calculateProportionalRefund,
  getReturnEligibility,
  searchReturnableSales,
  splitHighlightParts,
  type ReturnSearchResult,
} from '@/lib/returnSaleSearch';
import type { PaymentMethod, SaleTransaction, SaleItem } from '@/types';
import { db } from '@/lib/database';

const REFUND_METHODS: { value: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { value: 'cash', label: 'Cash Refund', icon: DollarSign },
  { value: 'debit', label: 'Debit Refund', icon: CreditCard },
  { value: 'credit', label: 'Credit Card Refund', icon: CreditCard },
  { value: 'store-credit', label: 'Store Credit', icon: Receipt },
];

function HighlightText({ text, query }: { text: string; query: string }) {
  const parts = splitHighlightParts(text, query);
  return (
    <>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className="bg-yellow-200/80 text-foreground rounded px-0.5">{part.text}</mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

interface SelectedReturnItem {
  saleItemId: string;
  quantity: number;
  refundAmount: number;
}

export default function ReturnsPage() {
  const { employee, store } = useAuthStore();
  const pos = usePosStore();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectHandled = useRef(false);

  const [activeTab, setActiveTab] = useState('process');

  // ── Process Return state ──
  const [step, setStep] = useState<'search' | 'select' | 'confirm'>('search');
  const [universalSearch, setUniversalSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [foundSale, setFoundSale] = useState<SaleTransaction | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedReturnItem[]>([]);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('cash');
  const [reason, setReason] = useState('Customer return');
  const [notes, setNotes] = useState('');
  const [restockSellable, setRestockSellable] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(universalSearch), 300);
    return () => clearTimeout(timer);
  }, [universalSearch]);

  useEffect(() => {
    if (!store?.id) return;
    db.getShopifySyncEvents(store.id).then((rows) => {
      setShopifyRestocks(rows.filter((row) => {
        const type = String((row as { event_type?: string }).event_type || '');
        return type === 'SHOPIFY_ORDER_CANCELLED' || type === 'SHOPIFY_REFUND_RESTOCK';
      }) as Array<Record<string, unknown>>);
    });
  }, [store?.id]);

  // ── History state ──
  const [historySearch, setHistorySearch] = useState('');
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [shopifyRestocks, setShopifyRestocks] = useState<Array<Record<string, unknown>>>([]);

  // Derived data
  const foundSaleItems = foundSale ? pos.saleItems.filter((i) => i.salesTransactionId === foundSale.id) : [];
  const salePayments = foundSale ? pos.salePayments.filter((p) => p.transactionId === foundSale.id) : [];
  const saleCustomer = foundSale?.customerId ? pos.customers.find((c) => c.id === foundSale.customerId) : null;

  const searchResults = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    return searchReturnableSales(debouncedSearch, {
      sales: pos.sales,
      saleItems: pos.saleItems,
      inventory: pos.inventory,
      customers: pos.customers,
      returns: pos.returns,
    });
  }, [debouncedSearch, pos.sales, pos.saleItems, pos.inventory, pos.customers, pos.returns]);

  const getItemEligibility = (item: SaleItem) => getReturnEligibility(item, pos.returns);

  const totalRefund = useMemo(() => selectedItems.reduce((s, i) => s + i.refundAmount, 0), [selectedItems]);

  // ── Stats ──
  const stats = useMemo(() => {
    const completed = pos.returns.filter((r) => r.status === 'completed');
    const today = completed.filter((r) => {
      const d = new Date(r.completedAt || r.createdAt);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    });
    return {
      totalReturns: completed.length,
      todayReturns: today.length,
      todayRefunded: today.reduce((s, r) => s + r.returnAmount, 0),
      totalRefunded: completed.reduce((s, r) => s + r.returnAmount, 0),
    };
  }, [pos.returns]);

  // ── History filtered ──
  const filteredHistory = useMemo(() => {
    let list = pos.returns.filter((r) => r.status === 'completed');
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      list = list.filter((r) => {
        const sale = pos.sales.find((s) => s.id === r.sourceTransactionId);
        const cust = r.customerId ? pos.customers.find((c) => c.id === r.customerId) : null;
        return (
          r.returnCode.toLowerCase().includes(q) ||
          (sale?.saleCode || '').toLowerCase().includes(q) ||
          (cust ? `${cust.firstName} ${cust.lastName}`.toLowerCase().includes(q) : false) ||
          r.reason.toLowerCase().includes(q)
        );
      });
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [pos.returns, pos.sales, pos.customers, historySearch]);

  // Detail return
  const detailReturn = showDetail ? pos.returns.find((r) => r.id === showDetail) : null;
  const detailSale = detailReturn ? pos.sales.find((s) => s.id === detailReturn.sourceTransactionId) : null;
  const detailItem = detailReturn?.sourceItemId ? pos.saleItems.find((i) => i.id === detailReturn.sourceItemId) : null;
  const detailCustomer = detailReturn?.customerId ? pos.customers.find((c) => c.id === detailReturn.customerId) : null;

  // ── Handlers ──
  const handleSelectSearchResult = (result: ReturnSearchResult) => {
    const sale = pos.sales.find((s) => s.id === result.saleId);
    if (!sale) {
      toast({ variant: 'destructive', title: 'Sale not found' });
      return;
    }
    if (sale.status === 'voided') {
      toast({ variant: 'destructive', title: 'This sale has been voided and cannot be returned.' });
      return;
    }

    const saleItem = pos.saleItems.find((i) => i.id === result.saleItemId);
    setFoundSale(sale);
    setSelectedItems(saleItem ? [{
      saleItemId: saleItem.id,
      quantity: result.quantityEligible,
      refundAmount: calculateProportionalRefund(saleItem, result.quantityEligible),
    }] : []);
    setStep('select');
  };

  useEffect(() => {
    const saleId = searchParams.get('saleId');
    if (!saleId || preselectHandled.current) return;
    const sale = pos.sales.find((s) => s.id === saleId);
    if (!sale) return;
    preselectHandled.current = true;
    setSearchParams({}, { replace: true });
    if (sale.status === 'voided' || sale.status === 'draft') {
      toast({ variant: 'destructive', title: 'This sale cannot be returned.' });
      return;
    }
    const items = pos.saleItems.filter((i) => i.salesTransactionId === sale.id);
    const firstEligible = items.find((item) => getReturnEligibility(item, pos.returns).quantityEligible > 0);
    if (!firstEligible) {
      toast({ variant: 'destructive', title: 'No returnable items on this sale.' });
      return;
    }
    const elig = getReturnEligibility(firstEligible, pos.returns);
    const cust = sale.customerId ? pos.customers.find((c) => c.id === sale.customerId) : null;
    handleSelectSearchResult({
      saleId: sale.id,
      saleItemId: firstEligible.id,
      saleCode: sale.saleCode,
      productName: `${firstEligible.brand} ${firstEligible.model}`,
      brand: firstEligible.brand,
      model: firstEligible.model,
      category: firstEligible.category,
      quantitySold: firstEligible.quantity,
      quantityReturned: elig.quantityReturned,
      quantityEligible: elig.quantityEligible,
      customerName: cust ? `${cust.firstName} ${cust.lastName}` : 'Walk-in',
      customerPhone: cust?.phone ?? '',
      customerEmail: cust?.email ?? '',
      saleDate: sale.completedAt || sale.createdAt,
      deviceCode: firstEligible.inventoryItemId
        ? (pos.inventory.find((i) => i.id === firstEligible.inventoryItemId)?.deviceCode ?? '')
        : '',
      serialImei: firstEligible.serialImei,
      searchText: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pos.sales, pos.saleItems, pos.returns]);

  const toggleItem = (item: SaleItem) => {
    const { quantityEligible } = getItemEligibility(item);
    if (quantityEligible <= 0) return;
    setSelectedItems((prev) => {
      const existing = prev.find((i) => i.saleItemId === item.id);
      if (existing) return prev.filter((i) => i.saleItemId !== item.id);
      return [...prev, {
        saleItemId: item.id,
        quantity: quantityEligible,
        refundAmount: calculateProportionalRefund(item, quantityEligible),
      }];
    });
  };

  const updateReturnQuantity = (saleItemId: string, rawQty: number) => {
    const item = foundSaleItems.find((i) => i.id === saleItemId);
    if (!item) return;
    const { quantityEligible } = getItemEligibility(item);
    const quantity = Math.min(Math.max(1, rawQty), quantityEligible);
    setSelectedItems((prev) => prev.map((i) => i.saleItemId === saleItemId ? {
      ...i,
      quantity,
      refundAmount: calculateProportionalRefund(item, quantity),
    } : i));
  };

  const updateRefundAmount = (saleItemId: string, amount: number) => {
    setSelectedItems((prev) => prev.map((i) => i.saleItemId === saleItemId ? { ...i, refundAmount: amount } : i));
  };

  const handleProceedToConfirm = () => {
    if (selectedItems.length === 0) { toast({ variant: 'destructive', title: 'Select at least one item to return.' }); return; }
    setStep('confirm');
  };

  const handleProcessReturn = async () => {
    if (!foundSale || !employee || !store) return;
    if (!reason.trim()) { toast({ variant: 'destructive', title: 'Enter a return reason.' }); return; }

    // Process one return per selected item for proper audit trail
    for (const sel of selectedItems) {
      const retId = pos.createReturn({
        sourceTransactionType: 'sale',
        sourceTransactionId: foundSale.id,
        sourceItemId: sel.saleItemId,
        customerId: foundSale.customerId,
        employeeId: employee.id,
        storeId: store.id,
        reason: `${reason}${notes ? ` — ${notes}` : ''}${restockSellable ? '' : ' — Damaged / not sellable'}`,
        returnAmount: sel.refundAmount,
        refundMethod,
        restockSellable,
      });
      await pos.completeReturn(retId, employee.fullName, sel.quantity);
    }

    toast({
      title: 'Return processed successfully',
      description: `${selectedItems.length} item(s) returned — ${formatCurrency(totalRefund)} refunded via ${refundMethod}`,
    });

    // Reset
    setFoundSale(null);
    setSelectedItems([]);
    setUniversalSearch('');
    setReason('Customer return');
    setNotes('');
    setRestockSellable(true);
    setStep('search');
  };

  const handleReset = () => {
    setFoundSale(null);
    setSelectedItems([]);
    setUniversalSearch('');
    setReason('Customer return');
    setNotes('');
    setRestockSellable(true);
    setStep('search');
  };

  const empName = (id: string) => {
    const emp = useAuthStore.getState().getEmployeeById(id);
    return emp?.fullName || id;
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Returns', value: String(stats.totalReturns), icon: RotateCcw, color: 'text-blue-600 bg-blue-50' },
          { label: 'Today Returns', value: String(stats.todayReturns), icon: Clock, color: 'text-purple-600 bg-purple-50' },
          { label: 'Today Refunded', value: formatCurrency(stats.todayRefunded), icon: DollarSign, color: 'text-red-600 bg-red-50' },
          { label: 'All Time Refunded', value: formatCurrency(stats.totalRefunded), icon: DollarSign, color: 'text-amber-600 bg-amber-50' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="pt-3 pb-2.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-muted-foreground font-medium">{s.label}</p>
                  <div className={`size-7 rounded-lg flex items-center justify-center ${s.color}`}><Icon className="size-3.5" /></div>
                </div>
                <p className="text-xl font-bold font-mono tabular-nums">{s.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="process" className="text-[11px] h-7 px-3">
            <RotateCcw className="size-3 mr-1.5" />Process Return
          </TabsTrigger>
          <TabsTrigger value="history" className="text-[11px] h-7 px-3">
            <History className="size-3 mr-1.5" />Return History
          </TabsTrigger>
        </TabsList>

        {/* ═══ PROCESS RETURN TAB ═══ */}
        <TabsContent value="process" className="mt-3">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-4">
            {[
              { key: 'search', label: '1. Find Sale', icon: Search },
              { key: 'select', label: '2. Select Items', icon: Package },
              { key: 'confirm', label: '3. Confirm & Refund', icon: CheckCircle },
            ].map((s, i) => {
              const Icon = s.icon;
              const isActive = step === s.key;
              const isPast = (step === 'select' && s.key === 'search') || (step === 'confirm' && (s.key === 'search' || s.key === 'select'));
              return (
                <div key={s.key} className="flex items-center gap-2">
                  {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground/30" />}
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                    isActive ? 'bg-primary text-white' : isPast ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                  }`}>
                    <Icon className="size-3" />
                    {s.label}
                  </div>
                </div>
              );
            })}
            {step !== 'search' && (
              <Button size="sm" variant="ghost" className="ml-auto h-7 text-[10px]" onClick={handleReset}>
                <ArrowLeft className="size-3 mr-1" />Start Over
              </Button>
            )}
          </div>

          {/* STEP 1: Universal Search */}
          {step === 'search' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[14px] flex items-center gap-2">
                    <Search className="size-4 text-primary" />Find Sale to Return
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-[11px] text-muted-foreground">
                    Search by product name, brand, model, device code, IMEI, serial, category, customer, phone, email, invoice/sale code, or date.
                  </p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <ScanLine className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50" />
                    <Input
                      placeholder="Search product, IMEI, device code, customer, sale code…"
                      value={universalSearch}
                      onChange={(e) => setUniversalSearch(e.target.value)}
                      className="pl-9 pr-9 h-11 text-[13px]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && searchResults.length > 0) {
                          handleSelectSearchResult(searchResults[0]);
                        }
                      }}
                    />
                  </div>
                  {debouncedSearch.trim() && (
                    <p className="text-[10px] text-muted-foreground">
                      {searchResults.length} match{searchResults.length !== 1 ? 'es' : ''}
                      {searchResults.length > 0 && ' · Press Enter to select the first result'}
                    </p>
                  )}
                </CardContent>
              </Card>

              {debouncedSearch.trim() ? (
                searchResults.length === 0 ? (
                  <Card className="min-h-[200px] flex items-center justify-center">
                    <div className="text-center px-4">
                      <Search className="size-10 mx-auto text-muted-foreground/20 mb-2" />
                      <p className="text-[13px] font-medium text-muted-foreground">No matching sales found</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-1">Try a different product name, IMEI, device code, or customer detail</p>
                    </div>
                  </Card>
                ) : (
                  <>
                    {/* Desktop table */}
                    <Card className="hidden md:block">
                      <CardContent className="pt-4 pb-2 px-0">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[10px]">Product</TableHead>
                                <TableHead className="text-[10px]">Sold</TableHead>
                                <TableHead className="text-[10px]">Returned</TableHead>
                                <TableHead className="text-[10px]">Eligible</TableHead>
                                <TableHead className="text-[10px]">Customer</TableHead>
                                <TableHead className="text-[10px]">Sale Date</TableHead>
                                <TableHead className="text-[10px]">Invoice</TableHead>
                                <TableHead className="text-[10px] w-24" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {searchResults.map((result) => (
                                <TableRow key={`${result.saleId}-${result.saleItemId}`}>
                                  <TableCell className="text-[11px]">
                                    <p className="font-medium">
                                      <HighlightText text={result.productName} query={debouncedSearch} />
                                    </p>
                                    <p className="text-[9px] text-muted-foreground mt-0.5">
                                      {result.deviceCode && <>Code: <HighlightText text={result.deviceCode} query={debouncedSearch} /> · </>}
                                      {result.serialImei && <>IMEI: <HighlightText text={result.serialImei} query={debouncedSearch} /></>}
                                    </p>
                                  </TableCell>
                                  <TableCell className="text-[11px] font-mono">{result.quantitySold}</TableCell>
                                  <TableCell className="text-[11px] font-mono">{result.quantityReturned}</TableCell>
                                  <TableCell className="text-[11px] font-mono font-semibold text-emerald-700">{result.quantityEligible}</TableCell>
                                  <TableCell className="text-[11px]">
                                    <HighlightText text={result.customerName} query={debouncedSearch} />
                                  </TableCell>
                                  <TableCell className="text-[11px]">{formatDate(result.saleDate)}</TableCell>
                                  <TableCell className="text-[11px] font-mono">
                                    <HighlightText text={result.saleCode} query={debouncedSearch} />
                                  </TableCell>
                                  <TableCell>
                                    <Button size="sm" className="h-7 text-[10px]" onClick={() => handleSelectSearchResult(result)}>
                                      Select
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Mobile cards */}
                    <div className="md:hidden space-y-2">
                      {searchResults.map((result) => (
                        <Card key={`${result.saleId}-${result.saleItemId}-mobile`}>
                          <CardContent className="pt-3 pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold truncate">
                                  <HighlightText text={result.productName} query={debouncedSearch} />
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  <HighlightText text={result.customerName} query={debouncedSearch} /> · {formatDate(result.saleDate)}
                                </p>
                                <p className="text-[10px] font-mono text-primary mt-0.5">
                                  <HighlightText text={result.saleCode} query={debouncedSearch} />
                                </p>
                                <div className="flex flex-wrap gap-2 mt-2 text-[9px]">
                                  <Badge variant="outline">Sold: {result.quantitySold}</Badge>
                                  <Badge variant="outline">Returned: {result.quantityReturned}</Badge>
                                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Eligible: {result.quantityEligible}</Badge>
                                </div>
                              </div>
                              <Button size="sm" className="h-8 text-[10px] shrink-0" onClick={() => handleSelectSearchResult(result)}>
                                Select
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )
              ) : (
                <Card className="min-h-[280px] flex items-center justify-center">
                  <div className="text-center px-6">
                    <RotateCcw className="size-12 mx-auto text-muted-foreground/15 mb-3" />
                    <p className="text-[14px] font-semibold text-muted-foreground mb-1">Search for a product or sale to start a return</p>
                    <p className="text-[11px] text-muted-foreground/70">Scan a barcode or type product details — no sale ID copy/paste needed</p>
                  </div>
                </Card>
              )}

              {/* Recent sales shortcut */}
              {!debouncedSearch.trim() && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[12px] text-muted-foreground">Recent Completed Sales</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 max-h-[240px] overflow-y-auto">
                      {pos.sales
                        .filter((s) => s.status === 'completed')
                        .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime())
                        .slice(0, 8)
                        .map((sale) => {
                          const items = pos.saleItems.filter((i) => i.salesTransactionId === sale.id);
                          const cust = sale.customerId ? pos.customers.find((c) => c.id === sale.customerId) : null;
                          const firstEligible = items.find((item) => getReturnEligibility(item, pos.returns).quantityEligible > 0);
                          return (
                            <button
                              key={sale.id}
                              disabled={!firstEligible}
                              onClick={() => {
                                if (!firstEligible) return;
                                const elig = getReturnEligibility(firstEligible, pos.returns);
                                handleSelectSearchResult({
                                  saleId: sale.id,
                                  saleItemId: firstEligible.id,
                                  saleCode: sale.saleCode,
                                  productName: `${firstEligible.brand} ${firstEligible.model}`,
                                  brand: firstEligible.brand,
                                  model: firstEligible.model,
                                  category: firstEligible.category,
                                  quantitySold: firstEligible.quantity,
                                  quantityReturned: elig.quantityReturned,
                                  quantityEligible: elig.quantityEligible,
                                  customerName: cust ? `${cust.firstName} ${cust.lastName}` : 'Walk-in',
                                  customerPhone: cust?.phone ?? '',
                                  customerEmail: cust?.email ?? '',
                                  saleDate: sale.completedAt || sale.createdAt,
                                  deviceCode: firstEligible.inventoryItemId
                                    ? pos.inventory.find((i) => i.id === firstEligible.inventoryItemId)?.deviceCode ?? ''
                                    : '',
                                  serialImei: firstEligible.serialImei,
                                  searchText: '',
                                });
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg border border-transparent hover:bg-secondary/60 hover:border-border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[11px] font-mono font-semibold text-primary shrink-0">{sale.saleCode}</span>
                                  {cust && <span className="text-[10px] text-muted-foreground truncate">{cust.firstName} {cust.lastName}</span>}
                                </div>
                                <span className="text-[11px] font-mono font-semibold tabular-nums shrink-0">{formatCurrency(sale.totalAmount)}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground">
                                <span>{items.length} line(s)</span>
                                <span>·</span>
                                <span>{formatDate(sale.completedAt || sale.createdAt)}</span>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* STEP 2: Select Items */}
          {step === 'select' && foundSale && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-8 space-y-4">
                {/* Sale info banner */}
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Receipt className="size-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold font-mono">{foundSale.saleCode}</span>
                            <Badge variant="outline" className="text-[9px] capitalize">{foundSale.status}</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span>{formatDateTime(foundSale.completedAt || foundSale.createdAt)}</span>
                            {saleCustomer && (<><span>·</span><span>{saleCustomer.firstName} {saleCustomer.lastName}</span><span>·</span><span>{saleCustomer.phone}</span></>)}
                            <span>·</span>
                            <span>{empName(foundSale.employeeId)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">Sale Total</p>
                        <p className="text-lg font-bold font-mono tabular-nums">{formatCurrency(foundSale.totalAmount)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Items selection */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-[14px]">Select Items to Return</CardTitle>
                      <Badge variant="outline" className="text-[9px]">{selectedItems.length} / {foundSaleItems.length} selected</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {foundSaleItems.map((item) => {
                        const { quantityReturned, quantityEligible } = getItemEligibility(item);
                        const isFullyReturned = quantityEligible <= 0;
                        const isSelected = selectedItems.some((s) => s.saleItemId === item.id);
                        const selItem = selectedItems.find((s) => s.saleItemId === item.id);
                        const inv = item.inventoryItemId ? pos.inventory.find((i) => i.id === item.inventoryItemId) : null;

                        return (
                          <div key={item.id} className={`rounded-lg border-2 p-4 transition-all ${
                            isFullyReturned ? 'opacity-50 border-red-200 bg-red-50/30'
                            : isSelected ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/30'
                          }`}>
                            <div className="flex items-start gap-3">
                              <div className="pt-1">
                                <Checkbox
                                  checked={isSelected}
                                  disabled={isFullyReturned}
                                  onCheckedChange={() => toggleItem(item)}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-[13px] font-semibold">{item.brand} {item.model}</p>
                                      {isFullyReturned && <Badge variant="destructive" className="text-[8px]">Fully Returned</Badge>}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                                      <span>Category: {item.category}</span>
                                      {item.serialImei && <span>S/N: {item.serialImei}</span>}
                                      {inv && <span>Device: {inv.deviceCode}</span>}
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      <Badge variant="outline" className="text-[9px]">Purchased: {item.quantity}</Badge>
                                      <Badge variant="outline" className="text-[9px]">Already Returned: {quantityReturned}</Badge>
                                      <Badge className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                        Available to Return: {quantityEligible}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] text-muted-foreground">Line Total</p>
                                    <p className="text-[14px] font-bold font-mono tabular-nums">{formatCurrency(item.lineTotal)}</p>
                                    <p className="text-[9px] text-muted-foreground">
                                      {item.quantity} × {formatCurrency(item.unitPrice)} + tax
                                    </p>
                                  </div>
                                </div>

                                {isSelected && selItem && (
                                  <div className="mt-3 p-3 bg-white rounded-lg border border-primary/20 space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <Label className="text-[10px] font-medium">Return Quantity</Label>
                                        <Input
                                          type="number"
                                          min={1}
                                          max={quantityEligible}
                                          value={selItem.quantity}
                                          onChange={(e) => updateReturnQuantity(item.id, Number(e.target.value))}
                                          className="mt-1 h-8 text-[12px] font-mono"
                                        />
                                        <p className="text-[9px] text-muted-foreground mt-1">Max: {quantityEligible}</p>
                                      </div>
                                      <div>
                                        <Label className="text-[10px] font-medium">Refund Amount</Label>
                                        <div className="relative mt-1">
                                          <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={selItem.refundAmount || ''}
                                            onChange={(e) => updateRefundAmount(item.id, Number(e.target.value))}
                                            className="pl-7 h-8 text-[12px] font-mono"
                                          />
                                        </div>
                                        <p className="text-[9px] text-muted-foreground mt-1">
                                          Suggested: {formatCurrency(calculateProportionalRefund(item, selItem.quantity))}
                                        </p>
                                      </div>
                                    </div>
                                    {selItem.refundAmount > calculateProportionalRefund(item, selItem.quantity) + 0.01 && (
                                      <div className="flex items-center gap-1.5 text-[10px] text-amber-700">
                                        <AlertTriangle className="size-3" />
                                        Refund exceeds proportional amount for {selItem.quantity} unit(s)
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right: Summary + actions */}
              <div className="lg:col-span-4 space-y-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-[13px]">Return Summary</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-muted-foreground">Items to return</span>
                        <span className="font-semibold">{selectedItems.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-muted-foreground">Total refund</span>
                        <span className="font-bold font-mono text-[15px] text-destructive tabular-nums">{formatCurrency(totalRefund)}</span>
                      </div>
                      <hr />

                      {/* Original sale payments */}
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">ORIGINAL PAYMENT</p>
                        <div className="space-y-1">
                          {salePayments.map((p) => (
                            <div key={p.id} className="flex items-center justify-between text-[11px]">
                              <span className="capitalize">{p.method}</span>
                              <span className="font-mono tabular-nums">{formatCurrency(p.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Button onClick={handleProceedToConfirm} disabled={selectedItems.length === 0} className="w-full h-10">
                  Continue to Refund <ChevronRight className="size-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Confirm & Process */}
          {step === 'confirm' && foundSale && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 space-y-4">
                {/* Items being returned */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-[14px]">Returning {selectedItems.length} Item(s)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedItems.map((sel) => {
                        const item = foundSaleItems.find((i) => i.id === sel.saleItemId);
                        if (!item) return null;
                        const inv = item.inventoryItemId ? pos.inventory.find((i) => i.id === item.inventoryItemId) : null;
                        return (
                          <div key={sel.saleItemId} className="flex items-center justify-between px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                            <div>
                              <p className="text-[12px] font-semibold">{item.brand} {item.model}</p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                <span>Return qty: {sel.quantity}</span>
                                <span>·</span>
                                <span>{item.category}</span>
                                {inv && (<><span>·</span><span>{inv.deviceCode}</span></>)}
                                {item.serialImei && (<><span>·</span><span>S/N: {item.serialImei}</span></>)}
                              </div>
                              {inv && (
                                <div className="flex items-center gap-1 mt-1 text-[9px] text-primary">
                                  <Package className="size-3" />
                                  Inventory will be restored to "returned" status
                                </div>
                              )}
                            </div>
                            <p className="text-[14px] font-bold font-mono tabular-nums text-destructive">{formatCurrency(sel.refundAmount)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Reason & notes */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-[13px]">Return Details</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-[11px]">Return Reason *</Label>
                        <Select value={reason} onValueChange={setReason}>
                          <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['Customer return', 'Defective product', 'Wrong item', 'Customer dissatisfied', 'Price match', 'Duplicate charge', 'Other'].map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px]">Additional Notes</Label>
                        <Textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="mt-1 text-[12px] min-h-[60px]"
                          placeholder="Optional notes about this return…"
                        />
                      </div>
                      <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
                        <Checkbox checked={restockSellable} onCheckedChange={(v) => setRestockSellable(v === true)} />
                        <span className="text-[12px]">
                          <span className="font-medium">Restock as sellable inventory</span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            Uncheck for damaged, scrapped, or not-sellable returns. Shopify will not be reactivated.
                          </span>
                        </span>
                      </label>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-5 space-y-4">
                {/* Refund method */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-[13px]">Refund Method</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      {REFUND_METHODS.map((m) => {
                        const Icon = m.icon;
                        const active = refundMethod === m.value;
                        return (
                          <button
                            key={m.value}
                            onClick={() => setRefundMethod(m.value)}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                              active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                            }`}
                          >
                            <Icon className={`size-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className={`text-[11px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>{m.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {refundMethod === 'cash' && pos.cashDrawer.isOpen && (
                      <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-800 flex items-start gap-2">
                        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                        <span>Cash drawer will be adjusted by <span className="font-mono font-bold">-{formatCurrency(totalRefund)}</span></span>
                      </div>
                    )}
                    {refundMethod === 'cash' && !pos.cashDrawer.isOpen && (
                      <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-800 flex items-start gap-2">
                        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                        <span>Cash drawer is closed. Open it first or choose another refund method.</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Final summary */}
                <Card className="border-2 border-destructive/30 bg-destructive/5">
                  <CardContent className="pt-4 pb-4">
                    <div className="text-center mb-3">
                      <p className="text-[11px] text-muted-foreground font-medium">Total Refund Amount</p>
                      <p className="text-3xl font-bold font-mono tabular-nums text-destructive">{formatCurrency(totalRefund)}</p>
                    </div>
                    <div className="space-y-1 text-[11px] mb-4">
                      <div className="flex justify-between"><span className="text-muted-foreground">Sale</span><span className="font-mono">{foundSale.saleCode}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span>{selectedItems.length}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span className="capitalize">{refundMethod}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Operator</span><span>{employee?.fullName}</span></div>
                    </div>
                    <Button variant="destructive" className="w-full h-11 text-[13px] font-semibold" onClick={handleProcessReturn}>
                      <CheckCircle className="size-4 mr-2" />Confirm Return — {formatCurrency(totalRefund)}
                    </Button>
                    <Button variant="ghost" className="w-full h-8 text-[10px] mt-2" onClick={() => setStep('select')}>
                      <ArrowLeft className="size-3 mr-1" />Back to Item Selection
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══ RETURN HISTORY TAB ═══ */}
        <TabsContent value="history" className="mt-3 space-y-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input placeholder="Search by return code, sale code, customer name…" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="pl-9 h-9 text-[12px]" />
                </div>
                <Badge variant="outline" className="text-[9px] font-mono">{filteredHistory.length} returns</Badge>
              </div>
            </CardContent>
          </Card>

          {filteredHistory.length === 0 ? (
            <Card className="min-h-[300px] flex items-center justify-center">
              <div className="text-center">
                <RotateCcw className="size-12 mx-auto text-muted-foreground/15 mb-2" />
                <p className="text-[13px] text-muted-foreground">No returns found</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map((ret) => {
                const sale = pos.sales.find((s) => s.id === ret.sourceTransactionId);
                const cust = ret.customerId ? pos.customers.find((c) => c.id === ret.customerId) : null;
                const saleItem = ret.sourceItemId ? pos.saleItems.find((i) => i.id === ret.sourceItemId) : null;
                return (
                  <Card key={ret.id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-lg bg-red-50 flex items-center justify-center">
                            <RotateCcw className="size-4 text-red-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-bold font-mono">{ret.returnCode}</span>
                              {sale && <span className="text-[10px] text-muted-foreground">← {sale.saleCode}</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                              {cust && <span>{cust.firstName} {cust.lastName}</span>}
                              {saleItem && (<><span>·</span><span>{saleItem.brand} {saleItem.model}</span></>)}
                              <span>·</span>
                              <span>{formatDateTime(ret.completedAt || ret.createdAt)}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{ret.reason}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-[14px] font-bold font-mono tabular-nums text-destructive">-{formatCurrency(ret.returnAmount)}</p>
                            <Badge variant="outline" className="text-[8px] capitalize">{ret.refundMethod}</Badge>
                          </div>
                          <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setShowDetail(ret.id)}>
                            <Eye className="size-3 mr-1" />View
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {shopifyRestocks.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-semibold">Shopify Cancellation / Refund restocks</p>
              {shopifyRestocks.map((event) => {
                const type = String(event.event_type || '');
                const source = type === 'SHOPIFY_ORDER_CANCELLED' ? 'Shopify Cancellation' : 'Shopify Refund';
                const inv = pos.inventory.find((i) => i.id === event.inventory_item_id);
                return (
                  <Card key={String(event.id)}>
                    <CardContent className="pt-3 pb-3 flex items-center justify-between">
                      <div>
                        <Badge variant="outline" className="text-[9px]">{source}</Badge>
                        <p className="text-[12px] font-medium mt-1">{inv ? `${inv.brand} ${inv.model}` : String(event.inventory_item_id || '')}</p>
                        <p className="text-[10px] text-muted-foreground">
                          POS qty {String(event.quantity_before ?? '—')} → {String(event.quantity_after ?? '—')}
                          {event.shopify_order_id ? ` · Order ${String(event.shopify_order_id)}` : ''}
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{event.created_at ? formatDateTime(String(event.created_at)) : ''}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══ DETAIL DIALOG ═══ */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Return Details</DialogTitle></DialogHeader>
          {detailReturn && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground">Return Code</p>
                  <p className="text-[13px] font-bold font-mono">{detailReturn.returnCode}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground">Original Sale</p>
                  <p className="text-[13px] font-bold font-mono">{detailSale?.saleCode || '—'}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground">Refund Amount</p>
                  <p className="text-[14px] font-bold font-mono text-destructive">{formatCurrency(detailReturn.returnAmount)}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground">Refund Method</p>
                  <p className="text-[13px] font-semibold capitalize">{detailReturn.refundMethod}</p>
                </div>
              </div>

              {detailItem && (
                <div className="p-3 bg-secondary/30 rounded-lg border">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-1">RETURNED ITEM</p>
                  <p className="text-[13px] font-semibold">{detailItem.brand} {detailItem.model}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span>{detailItem.category}</span>
                    {detailItem.serialImei && (<><span>·</span><span>S/N: {detailItem.serialImei}</span></>)}
                    <span>·</span>
                    <span>Qty {detailItem.quantity} × {formatCurrency(detailItem.unitPrice)}</span>
                  </div>
                </div>
              )}

              {detailCustomer && (
                <div className="p-3 bg-secondary/30 rounded-lg border">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-1">CUSTOMER</p>
                  <p className="text-[12px] font-semibold">{detailCustomer.firstName} {detailCustomer.lastName}</p>
                  <p className="text-[10px] text-muted-foreground">{detailCustomer.phone} · {detailCustomer.email}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div><span className="text-muted-foreground">Reason:</span> <span className="font-medium">{detailReturn.reason}</span></div>
                <div><span className="text-muted-foreground">Processed by:</span> <span className="font-medium">{empName(detailReturn.employeeId)}</span></div>
                <div><span className="text-muted-foreground">Created:</span> <span className="font-mono">{formatDateTime(detailReturn.createdAt)}</span></div>
                <div><span className="text-muted-foreground">Completed:</span> <span className="font-mono">{formatDateTime(detailReturn.completedAt)}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
