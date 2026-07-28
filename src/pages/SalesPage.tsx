import { useState, useMemo } from 'react';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, ShoppingCart, Trash2, Receipt, DollarSign, X, Printer, History } from 'lucide-react';
import { formatCurrency, formatDateTime, round2 } from '@/lib/taxCalc';
import { validateSaleQuantity } from '@/lib/inventorySale';
import { TAX_MODES, PAYMENT_METHODS } from '@/constants/config';
import SalesInvoiceDialog from '@/components/features/SalesInvoiceDialog';
import type { TaxMode, PaymentMethod, SaleTransaction } from '@/types';

export default function SalesPage() {
  const { employee, store } = useAuthStore();
  const pos = usePosStore();
  const { toast } = useToast();

  const [activeSaleId, setActiveSaleId] = useState<string | null>(null);
  const [invSearch, setInvSearch] = useState('');
  const [showNonInv, setShowNonInv] = useState(false);
  const [niForm, setNiForm] = useState({ category: '', brand: '', model: '', quantity: 1, unitPrice: 0, taxMode: 'both' as TaxMode });

  // Payment form
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payAmount, setPayAmount] = useState(0);
  const [payRef, setPayRef] = useState('');

  // Invoice dialog state
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceSale, setInvoiceSale] = useState<SaleTransaction | null>(null);

  // Reprint history
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [completing, setCompleting] = useState(false);

  const activeSale = pos.sales.find((s) => s.id === activeSaleId && s.status === 'draft');
  const activeSaleItems = useMemo(() => activeSaleId ? pos.saleItems.filter((i) => i.salesTransactionId === activeSaleId) : [], [pos.saleItems, activeSaleId]);
  const activeSalePayments = useMemo(() => activeSaleId ? pos.salePayments.filter((p) => p.transactionId === activeSaleId) : [], [pos.salePayments, activeSaleId]);
  const paidTotal = round2(activeSalePayments.reduce((s, p) => s + p.amount, 0));
  const remaining = round2((activeSale?.totalAmount || 0) - paidTotal);

  // Invoice data for display
  const invoiceSaleItems = useMemo(() => invoiceSale ? pos.saleItems.filter((i) => i.salesTransactionId === invoiceSale.id) : [], [pos.saleItems, invoiceSale]);
  const invoiceSalePayments = useMemo(() => invoiceSale ? pos.salePayments.filter((p) => p.transactionId === invoiceSale.id) : [], [pos.salePayments, invoiceSale]);
  const invoiceCustomer = invoiceSale?.customerId ? pos.customers.find((c) => c.id === invoiceSale.customerId) : null;

  // Completed sales for reprint (most recent first)
  const completedSales = useMemo(() => {
    let sales = pos.sales.filter((s) => s.status === 'completed');
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      sales = sales.filter((s) => {
        const cust = s.customerId ? pos.customers.find((c) => c.id === s.customerId) : null;
        return s.saleCode.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (cust && `${cust.firstName} ${cust.lastName}`.toLowerCase().includes(q));
      });
    }
    return sales
      .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime())
      .slice(0, 20);
  }, [pos.sales, pos.customers, historySearch]);

  const availableInv = useMemo(() => {
    const items = pos.inventory.filter((i) => i.status === 'listed' && i.quantityOnHand > 0);
    if (!invSearch.trim()) return items.slice(0, 20);
    const q = invSearch.toLowerCase();
    return items.filter((i) => `${i.brand} ${i.model}`.toLowerCase().includes(q) || i.deviceCode.toLowerCase().includes(q) || i.serialImei.toLowerCase().includes(q));
  }, [pos.inventory, invSearch]);

  const handleNewSale = () => {
    if (!employee || !store) return;
    const id = pos.createSale(employee.id, store.id);
    setActiveSaleId(id);
  };

  const handleAddInvItem = (invId: string) => {
    if (!activeSaleId) return;
    const inv = pos.inventory.find((i) => i.id === invId);
    if (!inv) return;
    if (activeSaleItems.some((l) => l.inventoryItemId === invId)) { toast({ variant: 'destructive', title: 'Already in cart' }); return; }
    pos.addSaleItem(activeSaleId, {
      inventoryItemId: inv.id, category: inv.category, brand: inv.brand, model: inv.model,
      serialImei: inv.serialImei, quantity: 1, unitPrice: inv.expectedSalePrice,
      taxMode: 'both', costPerUnitSnapshot: inv.costPerUnit,
    });
  };

  const handleAddNonInv = () => {
    if (!activeSaleId || !niForm.model) { toast({ variant: 'destructive', title: 'Enter model/description' }); return; }
    pos.addSaleItem(activeSaleId, {
      category: niForm.category || 'Accessories', brand: niForm.brand || 'Generic', model: niForm.model,
      serialImei: '', quantity: niForm.quantity, unitPrice: niForm.unitPrice,
      taxMode: niForm.taxMode, costPerUnitSnapshot: 0,
    });
    setShowNonInv(false);
    setNiForm({ category: '', brand: '', model: '', quantity: 1, unitPrice: 0, taxMode: 'both' });
  };

  const handleAddPayment = () => {
    if (!activeSaleId || payAmount <= 0) { toast({ variant: 'destructive', title: 'Enter a valid amount' }); return; }
    pos.addSalePayment(activeSaleId, payMethod, payAmount, payRef);
    setPayAmount(0);
    setPayRef('');
  };

  const getAvailableQuantity = (inventoryItemId: string) =>
    pos.inventory.find((i) => i.id === inventoryItemId)?.quantityOnHand ?? 0;

  const handleUpdateQuantity = (lineId: string, inventoryItemId: string | undefined, rawQty: number) => {
    if (!activeSaleId) return;
    const qty = Math.max(1, rawQty);

    if (inventoryItemId) {
      const available = getAvailableQuantity(inventoryItemId);
      const validation = validateSaleQuantity(qty, available);
      if (!validation.valid) {
        toast({ variant: 'destructive', title: validation.message });
        return;
      }
    }

    pos.updateSaleItem(activeSaleId, lineId, { quantity: qty });
  };

  const handleComplete = () => {
    if (completing) return;
    if (!activeSaleId || !activeSale || activeSaleItems.length === 0) { toast({ variant: 'destructive', title: 'Cart is empty' }); return; }
    if (remaining > 0.01) { toast({ variant: 'destructive', title: 'Payment incomplete', description: `Still owed: ${formatCurrency(remaining)}` }); return; }
    if (!employee) return;

    for (const line of activeSaleItems) {
      if (!line.inventoryItemId) continue;
      const available = getAvailableQuantity(line.inventoryItemId);
      const validation = validateSaleQuantity(line.quantity, available);
      if (!validation.valid) {
        toast({ variant: 'destructive', title: `${line.brand} ${line.model}`, description: validation.message });
        return;
      }
    }

    setCompleting(true);
    const saleForInvoice = { ...activeSale };
    const result = pos.completeSale(activeSaleId, employee.fullName);
    setCompleting(false);

    if (!result.success) {
      toast({ variant: 'destructive', title: 'Could not complete sale', description: result.error });
      return;
    }

    const completedSale = pos.sales.find((s) => s.id === activeSaleId);
    if (completedSale) {
      setInvoiceSale(completedSale);
      setShowInvoice(true);
    }

    setActiveSaleId(null);
    toast({ title: 'Sale completed!', description: `${saleForInvoice.saleCode} — ${formatCurrency(saleForInvoice.totalAmount)}` });
  };

  const handleVoid = () => {
    if (!activeSaleId) return;
    pos.voidSale(activeSaleId);
    setActiveSaleId(null);
    toast({ title: 'Sale voided' });
  };

  const handleReprintInvoice = (sale: SaleTransaction) => {
    setInvoiceSale(sale);
    setShowInvoice(true);
    setShowHistory(false);
  };

  const handleInvoicePrint = () => {
    if (invoiceSale && employee) {
      pos.logAction(employee.id, employee.fullName, 'Sales', 'INVOICE_PRINT', 'sale', invoiceSale.id,
        `Invoice printed for ${invoiceSale.saleCode} — ${formatCurrency(invoiceSale.totalAmount)}`);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-5 h-[calc(100vh-112px)]">
      {/* Left: Inventory search */}
      <div className="col-span-4 flex flex-col gap-4 min-h-0">
        <Card className="flex-1 flex flex-col min-h-0">
          <CardHeader className="pb-2 shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[14px]">Available Products</CardTitle>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setShowHistory(true)}>
                  <History className="size-3 mr-1" />Reprint
                </Button>
              </div>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Search brand, model, code…" value={invSearch} onChange={(e) => setInvSearch(e.target.value)} className="pl-9 h-9 text-[12px]" />
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto pt-0">
            <div className="space-y-1">
              {availableInv.map((item) => (
                <button key={item.id} onClick={() => activeSaleId && handleAddInvItem(item.id)} disabled={!activeSaleId}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[12px] truncate mr-2">{item.brand} {item.model}</span>
                    <span className="font-mono text-[12px] font-semibold tabular-nums text-primary shrink-0">{formatCurrency(item.expectedSalePrice)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-mono text-muted-foreground">{item.deviceCode}</span>
                    <span className="text-[9px] text-muted-foreground">{item.category}</span>
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5">Qty: {item.quantityOnHand}</Badge>
                    {item.serialImei && <span className="text-[9px] font-mono text-muted-foreground">IMEI: {item.serialImei}</span>}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: Cart + Payment */}
      <div className="col-span-8 flex flex-col gap-4 min-h-0 overflow-y-auto">
        {!activeSaleId ? (
          <Card className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <ShoppingCart className="size-12 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-muted-foreground font-medium mb-3">No active sale</p>
              <Button onClick={handleNewSale}><Plus className="size-4 mr-1.5" />New Sale</Button>
            </div>
          </Card>
        ) : (
          <>
            {/* Sale header */}
            <Card className="shrink-0">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] font-mono">{activeSale?.saleCode}</Badge>
                    <Badge variant="outline" className="text-[9px]">DRAFT</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setShowNonInv(true)}>
                      <Plus className="size-3 mr-1" />Non-Inventory
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive" onClick={handleVoid}>Void</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cart items */}
            <Card className="shrink-0">
              <CardHeader className="pb-2"><CardTitle className="text-[13px]">Cart ({activeSaleItems.length} items)</CardTitle></CardHeader>
              <CardContent>
                {activeSaleItems.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-[12px]">Select products from inventory</p>
                ) : (
                  <div className="space-y-2">
                    {activeSaleItems.map((line) => {
                      const maxQty = line.inventoryItemId ? getAvailableQuantity(line.inventoryItemId) : undefined;
                      return (
                      <div key={line.id} className="p-3 bg-secondary/40 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium text-[12px]">{line.brand} {line.model}</p>
                            {line.serialImei && <p className="text-[9px] font-mono text-muted-foreground">IMEI: {line.serialImei}</p>}
                            {maxQty !== undefined && (
                              <p className="text-[9px] text-muted-foreground mt-0.5">Available: {maxQty}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-[13px] font-bold tabular-nums">{formatCurrency(line.lineTotal)}</span>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => pos.removeSaleItem(activeSaleId, line.id)}>
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-[9px] text-muted-foreground">Qty</Label>
                            <Input type="number" value={line.quantity} min={1} max={maxQty}
                              onChange={(e) => handleUpdateQuantity(line.id, line.inventoryItemId, Number(e.target.value))}
                              className="h-7 text-[11px] font-mono mt-0.5" />
                          </div>
                          <div>
                            <Label className="text-[9px] text-muted-foreground">Unit Price</Label>
                            <Input type="number" value={line.unitPrice} step="0.01"
                              onChange={(e) => pos.updateSaleItem(activeSaleId, line.id, { unitPrice: Number(e.target.value) })}
                              className="h-7 text-[11px] font-mono mt-0.5" />
                          </div>
                          <div>
                            <Label className="text-[9px] text-muted-foreground">Tax</Label>
                            <Select value={line.taxMode} onValueChange={(v) => pos.updateSaleItem(activeSaleId, line.id, { taxMode: v as TaxMode })}>
                              <SelectTrigger className="h-7 text-[10px] mt-0.5"><SelectValue /></SelectTrigger>
                              <SelectContent>{TAX_MODES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    );})}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Totals + Payment */}
            <Card className="shrink-0">
              <CardContent className="pt-4 pb-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[13px] mb-3">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-right font-mono tabular-nums">{formatCurrency(activeSale?.subtotal || 0)}</span>
                  <span className="text-muted-foreground">GST (5%)</span>
                  <span className="text-right font-mono tabular-nums">{formatCurrency(activeSale?.gstTotal || 0)}</span>
                  <span className="text-muted-foreground">PST (7%)</span>
                  <span className="text-right font-mono tabular-nums">{formatCurrency(activeSale?.pstTotal || 0)}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-3 mb-4">
                  <span className="text-lg font-bold">Total</span>
                  <span className="text-2xl font-bold font-mono tabular-nums text-primary">{formatCurrency(activeSale?.totalAmount || 0)}</span>
                </div>

                {/* Split payment */}
                <p className="text-[12px] font-semibold mb-2">Payment</p>
                <div className="flex gap-2 items-end mb-2">
                  <div className="flex-1">
                    <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                      <SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="w-28">
                    <Input type="number" value={payAmount || ''} onChange={(e) => setPayAmount(Number(e.target.value))} className="h-8 text-[11px] font-mono" placeholder="0.00" />
                  </div>
                  <Button size="sm" className="h-8" onClick={handleAddPayment}><Plus className="size-3" /></Button>
                </div>
                {remaining > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] mb-2 text-primary" onClick={() => setPayAmount(remaining)}>
                    Fill remaining {formatCurrency(remaining)}
                  </Button>
                )}
                {activeSalePayments.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {activeSalePayments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-1.5 bg-secondary/40 rounded text-[11px]">
                        <Badge variant="outline" className="text-[9px] capitalize">{p.method}</Badge>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => pos.removeSalePayment(p.id)}><X className="size-3" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2 bg-secondary rounded-lg mb-3">
                  <span className="text-[12px] font-medium">Remaining</span>
                  <span className={`font-mono font-bold tabular-nums ${remaining <= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{formatCurrency(remaining)}</span>
                </div>

                <Button onClick={handleComplete} className="w-full h-11 text-[14px] font-semibold" disabled={!activeSaleItems.length || remaining > 0.01 || completing}>
                  <Receipt className="size-4 mr-2" />Complete Sale
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Non-inventory dialog */}
      <Dialog open={showNonInv} onOpenChange={setShowNonInv}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Non-Inventory Item</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div><Label className="text-[11px]">Category</Label><Input value={niForm.category} onChange={(e) => setNiForm({ ...niForm, category: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="Accessories" /></div>
            <div><Label className="text-[11px]">Brand</Label><Input value={niForm.brand} onChange={(e) => setNiForm({ ...niForm, brand: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="Generic" /></div>
            <div className="col-span-2"><Label className="text-[11px]">Description *</Label><Input value={niForm.model} onChange={(e) => setNiForm({ ...niForm, model: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="Screen protector, cable, etc." /></div>
            <div><Label className="text-[11px]">Quantity</Label><Input type="number" value={niForm.quantity} min={1} onChange={(e) => setNiForm({ ...niForm, quantity: Math.max(1, Number(e.target.value)) })} className="mt-1 h-9 text-[12px] font-mono" /></div>
            <div><Label className="text-[11px]">Unit Price ($)</Label><Input type="number" value={niForm.unitPrice || ''} step="0.01" onChange={(e) => setNiForm({ ...niForm, unitPrice: Number(e.target.value) })} className="mt-1 h-9 text-[12px] font-mono" /></div>
            <div>
              <Label className="text-[11px]">Tax Mode</Label>
              <Select value={niForm.taxMode} onValueChange={(v) => setNiForm({ ...niForm, taxMode: v as TaxMode })}>
                <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>{TAX_MODES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleAddNonInv} className="mt-3 w-full h-10">Add to Cart</Button>
        </DialogContent>
      </Dialog>

      {/* Sales Invoice Dialog */}
      <SalesInvoiceDialog
        open={showInvoice}
        onOpenChange={setShowInvoice}
        sale={invoiceSale}
        saleItems={invoiceSaleItems}
        salePayments={invoiceSalePayments}
        customer={invoiceCustomer}
        onPrint={handleInvoicePrint}
      />

      {/* Reprint History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <History className="size-5 text-primary" />
              Reprint Sales Invoice
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Search by sale code, ID, or customer name…" value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)} className="pl-9 h-9 text-[12px]" />
            </div>
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {completedSales.map((sale) => {
                const cust = sale.customerId ? pos.customers.find((c) => c.id === sale.customerId) : null;
                const itemCount = pos.saleItems.filter((i) => i.salesTransactionId === sale.id).length;
                const payments = pos.salePayments.filter((p) => p.transactionId === sale.id);
                const payMethods = [...new Set(payments.map((p) => p.method))].join(', ');
                return (
                  <div key={sale.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border hover:border-primary/20 hover:bg-primary/[0.02] transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-primary">{sale.saleCode}</span>
                        <Badge variant="outline" className="text-[8px] capitalize">{payMethods}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span className="font-medium text-foreground">{cust ? `${cust.firstName} ${cust.lastName}` : 'Walk-in'}</span>
                        <span>·</span>
                        <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span className="font-mono font-semibold text-foreground">{formatCurrency(sale.totalAmount)}</span>
                        <span>·</span>
                        <span>{formatDateTime(sale.completedAt || sale.createdAt)}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-[10px] shrink-0 ml-3"
                      onClick={() => handleReprintInvoice(sale)}>
                      <Printer className="size-3 mr-1" />Reprint
                    </Button>
                  </div>
                );
              })}
              {completedSales.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-[11px] text-muted-foreground">No completed sales found</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
