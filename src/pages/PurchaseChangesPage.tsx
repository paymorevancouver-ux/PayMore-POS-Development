import { useState, useMemo } from 'react';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Search, FileEdit, CheckCircle, History, Package, DollarSign, Ban, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/taxCalc';
import type { PurchaseTransaction, PurchaseItem } from '@/types';

export default function PurchaseChangesPage() {
  const { employee, store } = useAuthStore();
  const pos = usePosStore();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('new-change');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseTransaction | null>(null);
  const [selectedItem, setSelectedItem] = useState<PurchaseItem | null>(null);
  const [newBuyPrice, setNewBuyPrice] = useState(0);
  const [newBrand, setNewBrand] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newConditionNotes, setNewConditionNotes] = useState('');
  const [reason, setReason] = useState('');

  // Void dialog state
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [purchaseToVoid, setPurchaseToVoid] = useState<PurchaseTransaction | null>(null);

  // Recent completed purchases (most recent first)
  const recentPurchases = useMemo(() => {
    let purchases = pos.purchases.filter((p) => p.status === 'completed');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      purchases = purchases.filter((p) => {
        const cust = pos.customers.find((c) => c.id === p.customerId);
        const visit = pos.visits.find((v) => v.id === p.visitId);
        const items = pos.purchaseItems.filter((i) => i.purchaseTransactionId === p.id);
        const itemMatch = items.some((i) =>
          `${i.brand} ${i.model}`.toLowerCase().includes(q) ||
          i.serialImei.toLowerCase().includes(q)
        );
        return p.id.toLowerCase().includes(q) ||
          (visit && visit.visitCode.toLowerCase().includes(q)) ||
          (cust && `${cust.firstName} ${cust.lastName}`.toLowerCase().includes(q)) ||
          itemMatch;
      });
    }
    return purchases
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 15);
  }, [pos.purchases, pos.customers, pos.visits, pos.purchaseItems, searchQuery]);

  // Items for selected purchase
  const purchaseItems = useMemo(
    () => selectedPurchase ? pos.purchaseItems.filter((i) => i.purchaseTransactionId === selectedPurchase.id) : [],
    [pos.purchaseItems, selectedPurchase]
  );

  // Change history (most recent first) — includes void entries from audit log
  const changeHistory = useMemo(() => {
    return [...pos.purchaseChanges]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [pos.purchaseChanges]);

  // Voided purchases for history
  const voidedPurchases = useMemo(() => {
    return pos.purchases.filter((p) => p.status === 'voided')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [pos.purchases]);

  const handleSelectPurchase = (purchase: PurchaseTransaction) => {
    setSelectedPurchase(purchase);
    setSelectedItem(null);
    setReason('');
  };

  const handleSelectItem = (item: PurchaseItem) => {
    setSelectedItem(item);
    setNewBuyPrice(item.buyPrice);
    setNewBrand(item.brand);
    setNewModel(item.model);
    setNewConditionNotes(item.conditionNotes);
    setReason('');
  };

  const handleComplete = () => {
    if (!selectedPurchase || !selectedItem || !employee || !store || !reason.trim()) {
      toast({ variant: 'destructive', title: 'Fill all required fields' }); return;
    }

    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    if (newBuyPrice !== selectedItem.buyPrice) {
      oldValues.buyPrice = selectedItem.buyPrice;
      newValues.buyPrice = newBuyPrice;
    }
    if (newBrand !== selectedItem.brand) {
      oldValues.brand = selectedItem.brand;
      newValues.brand = newBrand;
    }
    if (newModel !== selectedItem.model) {
      oldValues.model = selectedItem.model;
      newValues.model = newModel;
    }
    if (newConditionNotes !== selectedItem.conditionNotes) {
      oldValues.conditionNotes = selectedItem.conditionNotes;
      newValues.conditionNotes = newConditionNotes;
    }

    if (Object.keys(newValues).length === 0) {
      toast({ variant: 'destructive', title: 'No changes detected' }); return;
    }

    pos.createPurchaseChange({
      purchaseTransactionId: selectedPurchase.id,
      purchaseItemId: selectedItem.id,
      oldValueJson: oldValues,
      newValueJson: newValues,
      reason,
      changedByEmployeeId: employee.id,
      storeId: store.id,
    });

    const changeId = pos.purchaseChanges[0]?.id;
    if (changeId) pos.completePurchaseChange(changeId, employee.fullName);

    toast({ title: 'Purchase change recorded' });
    setSelectedPurchase(null);
    setSelectedItem(null);
    setSearchQuery('');
    setReason('');
  };

  const handleClear = () => {
    setSelectedPurchase(null);
    setSelectedItem(null);
    setReason('');
  };

  // ── Void handlers ──
  const handleOpenVoidDialog = (purchase: PurchaseTransaction) => {
    setPurchaseToVoid(purchase);
    setVoidReason('');
    setShowVoidDialog(true);
  };

  const handleConfirmVoid = () => {
    if (!purchaseToVoid || !employee || !voidReason.trim()) {
      toast({ variant: 'destructive', title: 'Please enter a reason for voiding' });
      return;
    }

    // Check if any inventory items from this purchase have already been sold
    const items = pos.purchaseItems.filter((i) => i.purchaseTransactionId === purchaseToVoid.id);
    const soldItems = items.filter((item) => {
      if (!item.isDeal) return false;
      const invItem = pos.inventory.find((inv) => inv.sourcePurchaseItemId === item.id);
      return invItem && (invItem.status === 'sold' || invItem.status === 'listed');
    });

    const listedItems = soldItems.filter((item) => {
      const invItem = pos.inventory.find((inv) => inv.sourcePurchaseItemId === item.id);
      return invItem?.status === 'listed';
    });

    const actuallySold = soldItems.filter((item) => {
      const invItem = pos.inventory.find((inv) => inv.sourcePurchaseItemId === item.id);
      return invItem?.status === 'sold';
    });

    if (actuallySold.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Cannot void',
        description: `${actuallySold.length} item(s) from this purchase have already been sold. Process a return first.`,
      });
      return;
    }

    pos.voidPurchase(purchaseToVoid.id, voidReason, employee.id, employee.fullName);

    setShowVoidDialog(false);
    setPurchaseToVoid(null);
    setVoidReason('');
    setSelectedPurchase(null);
    setSelectedItem(null);
    toast({ title: 'Purchase voided', description: `${items.length} item(s) scrapped. Cash drawer adjusted if applicable.` });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="new-change" className="text-[11px] h-7 px-3">
            <FileEdit className="size-3 mr-1.5" />New Change
          </TabsTrigger>
          <TabsTrigger value="history" className="text-[11px] h-7 px-3">
            <History className="size-3 mr-1.5" />History ({changeHistory.length})
          </TabsTrigger>
          <TabsTrigger value="voided" className="text-[11px] h-7 px-3">
            <Ban className="size-3 mr-1.5" />Voided ({voidedPurchases.length})
          </TabsTrigger>
        </TabsList>

        {/* ═══ NEW CHANGE TAB ═══ */}
        <TabsContent value="new-change" className="mt-3">
          <div className="grid grid-cols-12 gap-5">
            {/* Left: Purchase + item selection */}
            <div className="col-span-5 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[14px]">Select Purchase</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input placeholder="Search by visit code, customer, device…"
                      value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9 text-[12px]" />
                  </div>

                  <div className="space-y-1 max-h-[250px] overflow-y-auto">
                    {recentPurchases.map((purchase) => {
                      const cust = pos.customers.find((c) => c.id === purchase.customerId);
                      const visit = pos.visits.find((v) => v.id === purchase.visitId);
                      const items = pos.purchaseItems.filter((i) => i.purchaseTransactionId === purchase.id);
                      const payments = pos.purchasePayments.filter((p) => p.transactionId === purchase.id);
                      const payMethods = [...new Set(payments.map((p) => p.method))].join(', ');
                      const isSelected = selectedPurchase?.id === purchase.id;
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
                    })}
                    {recentPurchases.length === 0 && (
                      <div className="text-center py-8">
                        <p className="text-[11px] text-muted-foreground">No completed purchases found</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Items in purchase */}
              {selectedPurchase && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-[13px]">Select Item to Edit</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] font-mono">{purchaseItems.length} items</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] text-red-700 border-red-200 hover:bg-red-50"
                          onClick={() => handleOpenVoidDialog(selectedPurchase)}
                        >
                          <Ban className="size-3 mr-1" />Void Purchase
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {purchaseItems.map((item) => {
                        const isSelected = selectedItem?.id === item.id;
                        return (
                          <button key={item.id} onClick={() => handleSelectItem(item)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${
                              isSelected ? 'bg-primary/5 border-primary/30' : 'border-border hover:bg-secondary/50'
                            }`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[12px] font-medium">{item.brand} {item.model}</span>
                              <span className="font-mono text-[12px] font-bold tabular-nums">{formatCurrency(item.buyPrice)}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant={item.isDeal ? 'default' : 'secondary'} className="text-[8px]">{item.isDeal ? 'DEAL' : 'NO DEAL'}</Badge>
                              <span className="text-[10px] text-muted-foreground">{item.category}</span>
                              {item.serialImei && <span className="text-[9px] font-mono text-muted-foreground">{item.serialImei}</span>}
                            </div>
                            {item.conditionNotes && (
                              <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{item.conditionNotes}</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right: Edit form */}
            <div className="col-span-7">
              {!selectedItem ? (
                <Card className="h-full flex items-center justify-center min-h-[400px]">
                  <div className="text-center">
                    <FileEdit className="size-12 mx-auto text-muted-foreground/20 mb-3" />
                    <p className="text-muted-foreground font-medium">Select a purchase and item to edit</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Choose a purchase from the list, then select which item to modify</p>
                    <p className="text-[11px] text-muted-foreground mt-2">Or select a purchase and click <span className="font-semibold text-red-600">Void Purchase</span> to cancel the entire transaction</p>
                  </div>
                </Card>
              ) : (
                <div className="space-y-4">
                  {/* Current values card */}
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Package className="size-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold">{selectedItem.brand} {selectedItem.model}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span className="capitalize">{selectedItem.condition}</span>
                            <span>·</span>
                            <span>{selectedItem.category}</span>
                            {selectedItem.serialImei && (
                              <>
                                <span>·</span>
                                <span className="font-mono">IMEI: {selectedItem.serialImei}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-muted-foreground">Current Price</p>
                          <p className="text-lg font-bold font-mono tabular-nums text-primary">{formatCurrency(selectedItem.buyPrice)}</p>
                        </div>
                      </div>
                      {selectedItem.conditionNotes && (
                        <div className="px-3 py-2 bg-secondary/30 rounded text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">Notes:</span> {selectedItem.conditionNotes}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Edit form */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-[14px]">Edit Item Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                          <Label className="text-[11px] font-medium">Brand</Label>
                          <Input value={newBrand} onChange={(e) => setNewBrand(e.target.value)}
                            className="mt-1 h-9 text-[12px]" />
                          {newBrand !== selectedItem.brand && (
                            <p className="text-[9px] text-amber-600 mt-0.5">Changed from: {selectedItem.brand}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-[11px] font-medium">Model</Label>
                          <Input value={newModel} onChange={(e) => setNewModel(e.target.value)}
                            className="mt-1 h-9 text-[12px]" />
                          {newModel !== selectedItem.model && (
                            <p className="text-[9px] text-amber-600 mt-0.5">Changed from: {selectedItem.model}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-[11px] font-medium">
                            <DollarSign className="size-3 inline mr-0.5" />Buy Price ($)
                          </Label>
                          <Input type="number" value={newBuyPrice || ''} step="0.01"
                            onChange={(e) => setNewBuyPrice(Number(e.target.value))}
                            className="mt-1 h-9 text-[12px] font-mono" />
                          {newBuyPrice !== selectedItem.buyPrice && (
                            <p className="text-[9px] text-amber-600 mt-0.5">
                              Changed from: {formatCurrency(selectedItem.buyPrice)} → {formatCurrency(newBuyPrice)}
                              {' '}({newBuyPrice > selectedItem.buyPrice ? '+' : ''}{formatCurrency(newBuyPrice - selectedItem.buyPrice)})
                            </p>
                          )}
                        </div>
                        <div>
                          <Label className="text-[11px] font-medium">Condition Notes</Label>
                          <Input value={newConditionNotes} onChange={(e) => setNewConditionNotes(e.target.value)}
                            className="mt-1 h-9 text-[12px]" />
                        </div>
                      </div>

                      <div className="mb-4">
                        <Label className="text-[11px] font-medium">Reason for change *</Label>
                        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 text-[12px] min-h-[60px]"
                          placeholder="Why is this purchase being changed?" />
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={handleComplete} className="flex-1 h-10"
                          disabled={!reason.trim() || (newBuyPrice === selectedItem.buyPrice && newBrand === selectedItem.brand && newModel === selectedItem.model && newConditionNotes === selectedItem.conditionNotes)}>
                          <CheckCircle className="size-4 mr-2" />Submit Change
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
                <CardTitle className="text-[14px]">Purchase Change History</CardTitle>
                <Badge variant="outline" className="text-[9px] font-mono">{changeHistory.length} records</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {changeHistory.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                  <History className="size-10 mx-auto text-muted-foreground/20 mb-2" />
                  <p className="text-[13px] text-muted-foreground font-medium">No purchase changes yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {changeHistory.map((pc) => {
                    const purchase = pos.purchases.find((p) => p.id === pc.purchaseTransactionId);
                    const item = pos.purchaseItems.find((i) => i.id === pc.purchaseItemId);
                    const visit = purchase ? pos.visits.find((v) => v.id === purchase.visitId) : null;
                    const cust = purchase ? pos.customers.find((c) => c.id === purchase.customerId) : null;
                    const changedBy = pos.auditLog.find((a) => a.recordId === pc.id)?.actorName || 'Unknown';

                    const changes: string[] = [];
                    for (const key of Object.keys(pc.newValueJson)) {
                      const oldVal = pc.oldValueJson[key];
                      const newVal = pc.newValueJson[key];
                      if (key === 'buyPrice') {
                        changes.push(`Price: ${formatCurrency(Number(oldVal))} → ${formatCurrency(Number(newVal))}`);
                      } else {
                        changes.push(`${key}: "${String(oldVal)}" → "${String(newVal)}"`);
                      }
                    }

                    return (
                      <div key={pc.id} className="p-3 rounded-lg border border-border hover:border-primary/10 transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px] font-mono">{visit?.visitCode || pc.purchaseTransactionId}</Badge>
                            <Badge className={`text-[8px] ${pc.status === 'completed' ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-amber-100 text-amber-700 border-0'}`}>
                              {pc.status}
                            </Badge>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">{formatDateTime(pc.completedAt || pc.createdAt)}</span>
                        </div>
                        {item && (
                          <p className="text-[12px] font-medium mb-1">{item.brand} {item.model}</p>
                        )}
                        {cust && (
                          <p className="text-[10px] text-muted-foreground mb-1.5">Customer: {cust.firstName} {cust.lastName}</p>
                        )}
                        <div className="p-2 bg-amber-50 rounded border border-amber-100 text-[10px] text-amber-800 mb-1.5">
                          {changes.map((c, i) => <p key={i}>{c}</p>)}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
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

        {/* ═══ VOIDED TAB ═══ */}
        <TabsContent value="voided" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[14px]">Voided Purchases</CardTitle>
                <Badge variant="outline" className="text-[9px] font-mono">{voidedPurchases.length} records</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {voidedPurchases.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
                  <Ban className="size-10 mx-auto text-muted-foreground/20 mb-2" />
                  <p className="text-[13px] text-muted-foreground font-medium">No voided purchases</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Voided purchases will appear here for audit reference</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {voidedPurchases.map((purchase) => {
                    const cust = pos.customers.find((c) => c.id === purchase.customerId);
                    const visit = pos.visits.find((v) => v.id === purchase.visitId);
                    const items = pos.purchaseItems.filter((i) => i.purchaseTransactionId === purchase.id);
                    const payments = pos.purchasePayments.filter((p) => p.transactionId === purchase.id);
                    const payMethods = [...new Set(payments.map((p) => p.method))].join(', ');
                    // Find the void audit log entry for the reason
                    const voidLog = pos.auditLog.find(
                      (a) => a.recordId === purchase.id && a.action === 'PURCHASE_VOID'
                    );
                    const voidReason = voidLog?.details?.match(/Reason: (.+)$/)?.[1] || 'No reason recorded';
                    const voidedBy = voidLog?.actorName || 'Unknown';

                    return (
                      <div key={purchase.id} className="p-3 rounded-lg border border-red-200 bg-red-50/30">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px] font-mono">{visit?.visitCode || purchase.id}</Badge>
                            <Badge className="text-[8px] bg-red-100 text-red-700 border-0">VOIDED</Badge>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">{formatDateTime(purchase.createdAt)}</span>
                        </div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[12px] font-medium">{cust ? `${cust.firstName} ${cust.lastName}` : 'Unknown'}</span>
                          <span className="font-mono text-[12px] font-bold tabular-nums text-red-700 line-through">{formatCurrency(purchase.totalAmount)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1.5">
                          <span>{items.length} device{items.length !== 1 ? 's' : ''}</span>
                          <span>·</span>
                          <span className="capitalize">{payMethods}</span>
                        </div>
                        {items.length > 0 && (
                          <div className="text-[10px] text-muted-foreground mb-1.5">
                            {items.map((i) => `${i.brand} ${i.model}`).join(' · ')}
                          </div>
                        )}
                        <div className="p-2 bg-red-50 rounded border border-red-200 text-[10px] text-red-800">
                          <span className="font-medium">Reason:</span> {voidReason}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1.5">
                          Voided by {voidedBy}
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

      {/* ═══ VOID CONFIRMATION DIALOG ═══ */}
      <Dialog open={showVoidDialog} onOpenChange={setShowVoidDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2 text-red-700">
              <AlertTriangle className="size-5" />
              Void Purchase
            </DialogTitle>
          </DialogHeader>

          {purchaseToVoid && (() => {
            const cust = pos.customers.find((c) => c.id === purchaseToVoid.customerId);
            const visit = pos.visits.find((v) => v.id === purchaseToVoid.visitId);
            const items = pos.purchaseItems.filter((i) => i.purchaseTransactionId === purchaseToVoid.id);
            const dealItems = items.filter((i) => i.isDeal);
            const payments = pos.purchasePayments.filter((p) => p.transactionId === purchaseToVoid.id);
            const cashTotal = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);

            // Check which inventory items exist and their status
            const inventoryImpact = dealItems.map((item) => {
              const invItem = pos.inventory.find((inv) => inv.sourcePurchaseItemId === item.id);
              return {
                item,
                invItem,
                canVoid: invItem ? (invItem.status === 'available' || invItem.status === 'listed') : true,
                status: invItem?.status || 'not found',
              };
            });

            const hasBlocker = inventoryImpact.some((i) => i.invItem?.status === 'sold');

            return (
              <div className="space-y-4 mt-2">
                {/* Purchase summary */}
                <div className="p-3 bg-secondary/50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[11px] font-semibold text-primary">{visit?.visitCode || purchaseToVoid.id}</span>
                    <span className="font-mono text-[13px] font-bold tabular-nums">{formatCurrency(purchaseToVoid.totalAmount)}</span>
                  </div>
                  <p className="text-[12px] font-medium">{cust ? `${cust.firstName} ${cust.lastName}` : 'Unknown'}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{items.length} item(s) · {formatDateTime(purchaseToVoid.createdAt)}</p>
                </div>

                {/* Impact warning */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-[11px] font-semibold text-amber-800 mb-1.5">This action will:</p>
                  <ul className="space-y-1 text-[11px] text-amber-700">
                    <li className="flex items-start gap-1.5">
                      <span className="shrink-0 mt-0.5">•</span>
                      <span>Mark the purchase as <span className="font-semibold">VOIDED</span></span>
                    </li>
                    {dealItems.length > 0 && (
                      <li className="flex items-start gap-1.5">
                        <span className="shrink-0 mt-0.5">•</span>
                        <span>Scrap <span className="font-semibold">{dealItems.length}</span> inventory item(s) created from this purchase</span>
                      </li>
                    )}
                    {cashTotal > 0 && (
                      <li className="flex items-start gap-1.5">
                        <span className="shrink-0 mt-0.5">•</span>
                        <span>Add <span className="font-semibold">{formatCurrency(cashTotal)}</span> back to cash drawer (reversal)</span>
                      </li>
                    )}
                  </ul>
                </div>

                {/* Inventory items that will be affected */}
                {inventoryImpact.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">Inventory items affected:</p>
                    {inventoryImpact.map(({ item, invItem, status }) => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-1.5 bg-secondary/30 rounded text-[11px]">
                        <span>{item.brand} {item.model}</span>
                        <Badge
                          variant="outline"
                          className={`text-[8px] ${status === 'sold' ? 'border-red-300 text-red-700' : status === 'listed' ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700'}`}
                        >
                          {invItem ? (status === 'available' ? 'Non-Listed' : status === 'listed' ? 'Available' : status) : 'Not in inventory'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {hasBlocker && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700">
                    <span className="font-semibold">Cannot void:</span> Some items have already been sold. Process a return first.
                  </div>
                )}

                {/* Reason */}
                <div>
                  <Label className="text-[11px] font-medium">Reason for voiding *</Label>
                  <Textarea
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    className="mt-1 text-[12px] min-h-[60px]"
                    placeholder="e.g. Customer changed their mind after confirming the deal"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleConfirmVoid}
                    className="flex-1 h-10"
                    disabled={!voidReason.trim() || hasBlocker}
                  >
                    <Ban className="size-4 mr-2" />Confirm Void Purchase
                  </Button>
                  <Button variant="outline" className="h-10" onClick={() => setShowVoidDialog(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
