import { useState, useMemo } from 'react';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Search, ArrowRightLeft, CheckCircle, Plus, X, History, Receipt, DollarSign, ShoppingBag } from 'lucide-react';
import { formatCurrency, formatDateTime, round2 } from '@/lib/taxCalc';
import { PAYMENT_METHODS } from '@/constants/config';
import type { PaymentMethod, SaleTransaction, PurchaseTransaction, TransactionPayment } from '@/types';

type TransactionType = 'sale' | 'purchase';

export default function PaymentChangesPage() {
  const { employee, store } = useAuthStore();
  const pos = usePosStore();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('new-change');
  const [txType, setTxType] = useState<TransactionType>('sale');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTx, setSelectedTx] = useState<SaleTransaction | PurchaseTransaction | null>(null);
  const [selectedTxType, setSelectedTxType] = useState<TransactionType>('sale');
  const [reason, setReason] = useState('');

  // New payment lines
  const [newPayments, setNewPayments] = useState<{ method: PaymentMethod; amount: number; reference: string }[]>([]);
  const [newMethod, setNewMethod] = useState<PaymentMethod>('cash');
  const [newAmount, setNewAmount] = useState(0);
  const [newRef, setNewRef] = useState('');

  // Get original payments for the selected transaction
  const originalPayments = useMemo(() => {
    if (!selectedTx) return [];
    if (selectedTxType === 'sale') {
      return pos.salePayments.filter((p) => p.transactionId === selectedTx.id);
    }
    return pos.purchasePayments.filter((p) => p.transactionId === selectedTx.id);
  }, [selectedTx, selectedTxType, pos.salePayments, pos.purchasePayments]);

  const txTotal = selectedTx ? ('totalAmount' in selectedTx ? selectedTx.totalAmount : 0) : 0;
  const newTotal = round2(newPayments.reduce((s, p) => s + p.amount, 0));

  // Recent sales (most recent first, completed only)
  const recentSales = useMemo(() => {
    let sales = pos.sales.filter((s) => s.status === 'completed');
    if (searchQuery.trim() && txType === 'sale') {
      const q = searchQuery.toLowerCase();
      sales = sales.filter((s) => {
        const cust = s.customerId ? pos.customers.find((c) => c.id === s.customerId) : null;
        return s.saleCode.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (cust && `${cust.firstName} ${cust.lastName}`.toLowerCase().includes(q));
      });
    }
    return sales
      .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime())
      .slice(0, 15);
  }, [pos.sales, pos.customers, searchQuery, txType]);

  // Recent purchases (most recent first, completed only)
  const recentPurchases = useMemo(() => {
    let purchases = pos.purchases.filter((p) => p.status === 'completed');
    if (searchQuery.trim() && txType === 'purchase') {
      const q = searchQuery.toLowerCase();
      purchases = purchases.filter((p) => {
        const cust = pos.customers.find((c) => c.id === p.customerId);
        const visit = pos.visits.find((v) => v.id === p.visitId);
        return p.id.toLowerCase().includes(q) ||
          (visit && visit.visitCode.toLowerCase().includes(q)) ||
          (cust && `${cust.firstName} ${cust.lastName}`.toLowerCase().includes(q));
      });
    }
    return purchases
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 15);
  }, [pos.purchases, pos.customers, pos.visits, searchQuery, txType]);

  // Change history (most recent first)
  const changeHistory = useMemo(() => {
    return [...pos.paymentChanges]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [pos.paymentChanges]);

  const handleSelectSale = (sale: SaleTransaction) => {
    setSelectedTx(sale);
    setSelectedTxType('sale');
    setNewPayments([]);
    setReason('');
  };

  const handleSelectPurchase = (purchase: PurchaseTransaction) => {
    setSelectedTx(purchase);
    setSelectedTxType('purchase');
    setNewPayments([]);
    setReason('');
  };

  const handleAddNewPayment = () => {
    if (newAmount <= 0) return;
    setNewPayments([...newPayments, { method: newMethod, amount: newAmount, reference: newRef }]);
    setNewAmount(0);
    setNewRef('');
  };

  const handleFillRemaining = () => {
    const rem = round2(txTotal - newTotal);
    if (rem > 0) setNewAmount(rem);
  };

  const handleComplete = () => {
    if (!selectedTx || !employee || !store || !reason.trim()) {
      toast({ variant: 'destructive', title: 'Enter a reason for this change' }); return;
    }
    if (Math.abs(newTotal - txTotal) > 0.01) {
      toast({ variant: 'destructive', title: 'Payment total must match transaction total', description: `Expected ${formatCurrency(txTotal)}, got ${formatCurrency(newTotal)}` }); return;
    }

    const txRef = selectedTxType === 'sale'
      ? (selectedTx as SaleTransaction).saleCode
      : (selectedTx as PurchaseTransaction).id;

    const fakeNewPayments: TransactionPayment[] = newPayments.map((p, i) => ({
      id: `new-${i}`, transactionType: selectedTxType, transactionId: selectedTx.id,
      lineNumber: i + 1, method: p.method, amount: p.amount, reference: p.reference, createdAt: new Date().toISOString(),
    }));

    pos.createPaymentChange({
      transactionType: selectedTxType,
      transactionId: selectedTx.id,
      transactionRef: txRef,
      oldPaymentJson: originalPayments,
      newPaymentJson: fakeNewPayments,
      reason,
      changedByEmployeeId: employee.id,
      storeId: store.id,
    });

    // Remove old payments and add new ones
    if (selectedTxType === 'sale') {
      originalPayments.forEach((p) => pos.removeSalePayment(p.id));
      newPayments.forEach((p) => pos.addSalePayment(selectedTx.id, p.method, p.amount, p.reference));
    } else {
      originalPayments.forEach((p) => pos.removePurchasePayment(p.id));
      newPayments.forEach((p) => pos.addPurchasePayment(selectedTx.id, p.method, p.amount, p.reference));
    }

    const changeId = pos.paymentChanges[0]?.id;
    if (changeId) pos.completePaymentChange(changeId, employee.fullName);

    toast({ title: 'Payment change completed' });
    setSelectedTx(null);
    setSearchQuery('');
    setNewPayments([]);
    setReason('');
  };

  const handleClear = () => {
    setSelectedTx(null);
    setNewPayments([]);
    setReason('');
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="new-change" className="text-[11px] h-7 px-3">
            <ArrowRightLeft className="size-3 mr-1.5" />New Change
          </TabsTrigger>
          <TabsTrigger value="history" className="text-[11px] h-7 px-3">
            <History className="size-3 mr-1.5" />History ({changeHistory.length})
          </TabsTrigger>
        </TabsList>

        {/* ═══ NEW CHANGE TAB ═══ */}
        <TabsContent value="new-change" className="mt-3">
          <div className="grid grid-cols-12 gap-5">
            {/* Left: Transaction selection */}
            <div className="col-span-5 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[14px]">Select Transaction</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Type toggle */}
                  <div className="flex gap-2 mb-3">
                    <Button size="sm" variant={txType === 'sale' ? 'default' : 'outline'} className="flex-1 h-8 text-[11px]"
                      onClick={() => { setTxType('sale'); setSelectedTx(null); setSearchQuery(''); }}>
                      <Receipt className="size-3 mr-1" />Sales
                    </Button>
                    <Button size="sm" variant={txType === 'purchase' ? 'default' : 'outline'} className="flex-1 h-8 text-[11px]"
                      onClick={() => { setTxType('purchase'); setSelectedTx(null); setSearchQuery(''); }}>
                      <ShoppingBag className="size-3 mr-1" />Purchases
                    </Button>
                  </div>

                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input placeholder={txType === 'sale' ? 'Search sale code, customer…' : 'Search purchase ID, visit code, customer…'}
                      value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9 text-[12px]" />
                  </div>

                  <div className="space-y-1 max-h-[calc(100vh-380px)] overflow-y-auto">
                    {txType === 'sale' ? (
                      recentSales.map((sale) => {
                        const cust = sale.customerId ? pos.customers.find((c) => c.id === sale.customerId) : null;
                        const items = pos.saleItems.filter((i) => i.salesTransactionId === sale.id);
                        const payments = pos.salePayments.filter((p) => p.transactionId === sale.id);
                        const payMethods = [...new Set(payments.map((p) => p.method))].join(', ');
                        const isSelected = selectedTx?.id === sale.id;
                        return (
                          <button key={sale.id} onClick={() => handleSelectSale(sale)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${
                              isSelected ? 'bg-primary/5 border-primary/30' : 'border-border hover:border-primary/20 hover:bg-primary/[0.02]'
                            }`}>
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[11px] font-semibold text-primary">{sale.saleCode}</span>
                              <span className="font-mono text-[12px] font-bold tabular-nums">{formatCurrency(sale.totalAmount)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                              <span className="font-medium text-foreground">{cust ? `${cust.firstName} ${cust.lastName}` : 'Walk-in'}</span>
                              <span>·</span>
                              <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                              <span>·</span>
                              <span className="capitalize">{payMethods}</span>
                              <span>·</span>
                              <span>{formatDateTime(sale.completedAt || sale.createdAt)}</span>
                            </div>
                            {items.length > 0 && (
                              <div className="mt-1 text-[9px] text-muted-foreground truncate">
                                {items.map((i) => `${i.brand} ${i.model}`).join(' · ')}
                              </div>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      recentPurchases.map((purchase) => {
                        const cust = pos.customers.find((c) => c.id === purchase.customerId);
                        const visit = pos.visits.find((v) => v.id === purchase.visitId);
                        const items = pos.purchaseItems.filter((i) => i.purchaseTransactionId === purchase.id);
                        const payments = pos.purchasePayments.filter((p) => p.transactionId === purchase.id);
                        const payMethods = [...new Set(payments.map((p) => p.method))].join(', ');
                        const isSelected = selectedTx?.id === purchase.id;
                        return (
                          <button key={purchase.id} onClick={() => handleSelectPurchase(purchase)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${
                              isSelected ? 'bg-primary/5 border-primary/30' : 'border-border hover:border-primary/20 hover:bg-primary/[0.02]'
                            }`}>
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[11px] font-semibold text-primary">{visit?.visitCode || purchase.id}</span>
                              <span className="font-mono text-[12px] font-bold tabular-nums">{formatCurrency(purchase.totalAmount)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                              <span className="font-medium text-foreground">{cust ? `${cust.firstName} ${cust.lastName}` : 'Unknown'}</span>
                              <span>·</span>
                              <span>{items.length} device{items.length !== 1 ? 's' : ''}</span>
                              <span>·</span>
                              <span className="capitalize">{payMethods}</span>
                              <span>·</span>
                              <span>{formatDateTime(purchase.createdAt)}</span>
                            </div>
                            {items.length > 0 && (
                              <div className="mt-1 text-[9px] text-muted-foreground truncate">
                                {items.map((i) => `${i.brand} ${i.model}`).join(' · ')}
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                    {((txType === 'sale' && recentSales.length === 0) || (txType === 'purchase' && recentPurchases.length === 0)) && (
                      <div className="text-center py-8">
                        <p className="text-[11px] text-muted-foreground">No completed {txType === 'sale' ? 'sales' : 'purchases'} found</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Payment change form */}
            <div className="col-span-7">
              {!selectedTx ? (
                <Card className="h-full flex items-center justify-center min-h-[400px]">
                  <div className="text-center">
                    <ArrowRightLeft className="size-12 mx-auto text-muted-foreground/20 mb-3" />
                    <p className="text-muted-foreground font-medium">Select a transaction to change its payment method</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Choose a sale or purchase from the list on the left</p>
                  </div>
                </Card>
              ) : (
                <div className="space-y-4">
                  {/* Transaction summary */}
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge className="text-[9px] font-mono">
                              {selectedTxType === 'sale' ? (selectedTx as SaleTransaction).saleCode : (selectedTx as PurchaseTransaction).id}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] capitalize">{selectedTxType}</Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {formatDateTime(selectedTx.createdAt)}
                            {selectedTxType === 'sale' && (selectedTx as SaleTransaction).customerId && (() => {
                              const c = pos.customers.find((cx) => cx.id === (selectedTx as SaleTransaction).customerId);
                              return c ? ` · ${c.firstName} ${c.lastName}` : '';
                            })()}
                            {selectedTxType === 'purchase' && (() => {
                              const c = pos.customers.find((cx) => cx.id === (selectedTx as PurchaseTransaction).customerId);
                              return c ? ` · ${c.firstName} ${c.lastName}` : '';
                            })()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">Transaction Total</p>
                          <p className="text-xl font-bold font-mono tabular-nums text-primary">{formatCurrency(txTotal)}</p>
                        </div>
                      </div>

                      {/* Items in transaction */}
                      <div className="space-y-1 mb-3">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">Items</p>
                        {selectedTxType === 'sale' ? (
                          pos.saleItems.filter((i) => i.salesTransactionId === selectedTx.id).map((item) => (
                            <div key={item.id} className="flex items-center justify-between px-2.5 py-1.5 bg-secondary/30 rounded text-[11px]">
                              <span>{item.brand} {item.model} {item.serialImei ? `(${item.serialImei})` : ''}</span>
                              <span className="font-mono tabular-nums">{formatCurrency(item.lineTotal)}</span>
                            </div>
                          ))
                        ) : (
                          pos.purchaseItems.filter((i) => i.purchaseTransactionId === selectedTx.id).map((item) => (
                            <div key={item.id} className="flex items-center justify-between px-2.5 py-1.5 bg-secondary/30 rounded text-[11px]">
                              <span>{item.brand} {item.model} {item.serialImei ? `(${item.serialImei})` : ''}</span>
                              <span className="font-mono tabular-nums">{formatCurrency(item.buyPrice)}</span>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Current payments */}
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Current Payment</p>
                      <div className="space-y-1">
                        {originalPayments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-200 rounded text-[12px]">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[9px] capitalize border-red-300 text-red-700">{p.method}</Badge>
                              {p.reference && <span className="text-[9px] font-mono text-muted-foreground">{p.reference}</span>}
                            </div>
                            <span className="font-mono font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* New payment split */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-[14px]">New Payment Split</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2 items-end mb-3">
                        <div className="flex-1">
                          <Label className="text-[10px]">Method</Label>
                          <Select value={newMethod} onValueChange={(v) => setNewMethod(v as PaymentMethod)}>
                            <SelectTrigger className="h-8 text-[11px] mt-0.5"><SelectValue /></SelectTrigger>
                            <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="w-28">
                          <Label className="text-[10px]">Amount</Label>
                          <Input type="number" value={newAmount || ''} onChange={(e) => setNewAmount(Number(e.target.value))} className="h-8 text-[11px] font-mono mt-0.5" />
                        </div>
                        <div className="w-24">
                          <Label className="text-[10px]">Ref</Label>
                          <Input value={newRef} onChange={(e) => setNewRef(e.target.value)} className="h-8 text-[11px] mt-0.5" placeholder="optional" />
                        </div>
                        <Button size="sm" className="h-8" onClick={handleAddNewPayment}><Plus className="size-3" /></Button>
                      </div>

                      {txTotal - newTotal > 0.01 && (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] mb-2 text-primary" onClick={handleFillRemaining}>
                          Fill remaining {formatCurrency(round2(txTotal - newTotal))}
                        </Button>
                      )}

                      {newPayments.length > 0 && (
                        <div className="space-y-1 mb-3">
                          {newPayments.map((p, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-[12px]">
                              <div className="flex items-center gap-2">
                                <Badge className="text-[9px] capitalize bg-emerald-600">{p.method}</Badge>
                                {p.reference && <span className="text-[9px] font-mono text-muted-foreground">{p.reference}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setNewPayments(newPayments.filter((_, idx) => idx !== i))}>
                                  <X className="size-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          <div className="flex items-center justify-between px-3 py-2 bg-secondary rounded text-[12px]">
                            <span className="font-medium">New Total</span>
                            <span className={`font-mono font-bold tabular-nums ${Math.abs(newTotal - txTotal) < 0.01 ? 'text-emerald-600' : 'text-destructive'}`}>
                              {formatCurrency(newTotal)}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="mb-3">
                        <Label className="text-[11px]">Reason for change *</Label>
                        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 text-[12px] min-h-[60px]" placeholder="Why is this payment being changed?" />
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={handleComplete} className="flex-1 h-10" disabled={newPayments.length === 0 || !reason.trim() || Math.abs(newTotal - txTotal) > 0.01}>
                          <CheckCircle className="size-4 mr-2" />Complete Payment Change
                        </Button>
                        <Button variant="outline" className="h-10" onClick={handleClear}>Cancel</Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ═══ HISTORY TAB ═══ */}
        <TabsContent value="history" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[14px]">Payment Change History</CardTitle>
                <Badge variant="outline" className="text-[9px] font-mono">{changeHistory.length} records</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {changeHistory.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                  <History className="size-10 mx-auto text-muted-foreground/20 mb-2" />
                  <p className="text-[13px] text-muted-foreground font-medium">No payment changes yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {changeHistory.map((pc) => {
                    const changedBy = pos.auditLog.find((a) => a.recordId === pc.id)?.actorName || 'Unknown';
                    const oldMethods = pc.oldPaymentJson.map((p) => `${p.method}: ${formatCurrency(p.amount)}`).join(', ');
                    const newMethods = pc.newPaymentJson.map((p) => `${p.method}: ${formatCurrency(p.amount)}`).join(', ');
                    return (
                      <div key={pc.id} className="p-3 rounded-lg border border-border hover:border-primary/10 transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px] font-mono">{pc.transactionRef}</Badge>
                            <Badge variant="secondary" className="text-[8px] capitalize">{pc.transactionType}</Badge>
                            <Badge className={`text-[8px] ${pc.status === 'completed' ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-amber-100 text-amber-700 border-0'}`}>
                              {pc.status}
                            </Badge>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">{formatDateTime(pc.completedAt || pc.createdAt)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[10px] mt-2">
                          <div className="p-2 bg-red-50 rounded border border-red-100">
                            <p className="text-[9px] font-semibold text-red-700 uppercase mb-1">Before</p>
                            <p className="text-red-800">{oldMethods}</p>
                          </div>
                          <div className="p-2 bg-emerald-50 rounded border border-emerald-100">
                            <p className="text-[9px] font-semibold text-emerald-700 uppercase mb-1">After</p>
                            <p className="text-emerald-800">{newMethods}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                          <span className="font-medium text-foreground">Reason:</span>
                          <span>{pc.reason}</span>
                          <span className="ml-auto">by {changedBy}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
