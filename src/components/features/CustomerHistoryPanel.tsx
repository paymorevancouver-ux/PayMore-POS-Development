import { useMemo, useState } from 'react';
import { usePosStore } from '@/stores/posStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  History, DollarSign, Package, Calendar, Printer, Hash,
  ShoppingBag, ChevronDown, ChevronUp, Eye, Clock,
} from 'lucide-react';
import { formatCurrency, formatDateTime, formatDate } from '@/lib/taxCalc';
import BookLabelDialog from '@/components/features/BookLabelDialog';
import type { Customer, PurchaseItem } from '@/types';

interface CustomerHistoryPanelProps {
  customer: Customer;
  currentVisitId?: string | null;
  onPrintLabel?: (visitId: string) => void;
}

export default function CustomerHistoryPanel({ customer, currentVisitId, onPrintLabel }: CustomerHistoryPanelProps) {
  const pos = usePosStore();
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null);
  const [reprintVisitId, setReprintVisitId] = useState<string | null>(null);

  // All visits for this customer
  const customerVisits = useMemo(
    () => pos.visits.filter((v) => v.customerId === customer.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [pos.visits, customer.id]
  );

  // All completed purchases for this customer
  const completedPurchases = useMemo(
    () => pos.purchases.filter((p) => p.customerId === customer.id && p.status === 'completed'),
    [pos.purchases, customer.id]
  );

  // All devices sold to store
  const allDevicesSold = useMemo(() => {
    const items: (PurchaseItem & { purchaseDate: string; visitCode: string })[] = [];
    completedPurchases.forEach((p) => {
      const visit = pos.visits.find((v) => v.id === p.visitId);
      const pItems = pos.purchaseItems.filter((i) => i.purchaseTransactionId === p.id);
      pItems.forEach((item) => {
        items.push({ ...item, purchaseDate: p.createdAt, visitCode: visit?.visitCode || '—' });
      });
    });
    return items.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
  }, [completedPurchases, pos.purchaseItems, pos.visits]);

  // Stats
  const stats = useMemo(() => {
    const totalSpend = completedPurchases.reduce((s, p) => s + p.totalAmount, 0);
    const totalDevices = allDevicesSold.length;
    const dealDevices = allDevicesSold.filter((d) => d.isDeal).length;
    const lastVisit = customerVisits.length > 0 ? customerVisits[0].createdAt : null;
    const avgPurchase = completedPurchases.length > 0 ? totalSpend / completedPurchases.length : 0;

    return {
      visitCount: customerVisits.filter((v) => v.id !== currentVisitId).length,
      purchaseCount: completedPurchases.length,
      totalSpend,
      totalDevices,
      dealDevices,
      lastVisit,
      avgPurchase,
    };
  }, [customerVisits, completedPurchases, allDevicesSold, currentVisitId]);

  // Reprint data
  const reprintVisit = reprintVisitId ? pos.visits.find((v) => v.id === reprintVisitId) : null;
  const reprintPurchase = reprintVisit ? pos.purchases.find((p) => p.visitId === reprintVisit.id) : null;
  const reprintPurchaseItems = reprintPurchase ? pos.purchaseItems.filter((i) => i.purchaseTransactionId === reprintPurchase.id) : [];
  const reprintLabelLog = reprintVisit ? pos.labels.find((l) => l.visitId === reprintVisit.id) : undefined;

  const handleReprintConfirm = () => {
    if (reprintVisitId && onPrintLabel) {
      onPrintLabel(reprintVisitId);
    }
  };

  // Past visits (exclude current)
  const pastVisits = customerVisits.filter((v) => v.id !== currentVisitId);

  return (
    <>
      {/* Summary Stats */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <History className="size-3.5 text-primary" />
            <CardTitle className="text-[12px]">Customer History</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {stats.visitCount === 0 ? (
            <div className="text-center py-3">
              <ShoppingBag className="size-6 mx-auto text-muted-foreground/20 mb-1" />
              <p className="text-[11px] text-muted-foreground">First-time customer</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* KPI mini-grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-primary/5 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="size-3 text-primary" />
                    <p className="text-[9px] text-muted-foreground font-medium">Lifetime Spend</p>
                  </div>
                  <p className="text-[15px] font-bold font-mono tabular-nums text-primary">{formatCurrency(stats.totalSpend)}</p>
                </div>
                <div className="bg-secondary/60 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Hash className="size-3 text-muted-foreground" />
                    <p className="text-[9px] text-muted-foreground font-medium">Total Visits</p>
                  </div>
                  <p className="text-[15px] font-bold font-mono tabular-nums">{stats.visitCount}</p>
                </div>
                <div className="bg-secondary/60 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Package className="size-3 text-muted-foreground" />
                    <p className="text-[9px] text-muted-foreground font-medium">Devices Sold</p>
                  </div>
                  <p className="text-[15px] font-bold font-mono tabular-nums">{stats.totalDevices}</p>
                  <p className="text-[9px] text-muted-foreground">{stats.dealDevices} deals</p>
                </div>
                <div className="bg-secondary/60 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="size-3 text-muted-foreground" />
                    <p className="text-[9px] text-muted-foreground font-medium">Avg Purchase</p>
                  </div>
                  <p className="text-[15px] font-bold font-mono tabular-nums">{formatCurrency(stats.avgPurchase)}</p>
                </div>
              </div>

              {stats.lastVisit && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-1">
                  <Clock className="size-3" />
                  <span>Last visit: <span className="font-medium text-foreground">{formatDate(stats.lastVisit)}</span></span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past Visits with Details */}
      {pastVisits.length > 0 && (
        <Card className="flex-1 overflow-hidden flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[12px]">Past Visits & Devices</CardTitle>
              <Badge variant="outline" className="text-[9px]">{pastVisits.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            <div className="space-y-1.5">
              {pastVisits.slice(0, 20).map((visit) => {
                const purch = pos.purchases.find((p) => p.visitId === visit.id && p.status === 'completed');
                const items = purch ? pos.purchaseItems.filter((i) => i.purchaseTransactionId === purch.id) : [];
                const labelLog = pos.labels.find((l) => l.visitId === visit.id);
                const isExpanded = expandedVisit === visit.id;

                return (
                  <div key={visit.id} className="rounded-lg border border-border hover:border-primary/20 transition-colors overflow-hidden">
                    {/* Visit header row */}
                    <button
                      onClick={() => setExpandedVisit(isExpanded ? null : visit.id)}
                      className="w-full text-left px-3 py-2.5 flex items-center justify-between cursor-pointer hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-semibold text-primary">{visit.visitCode}</span>
                          {purch && (
                            <span className="font-mono text-[10px] font-semibold tabular-nums">{formatCurrency(purch.totalAmount)}</span>
                          )}
                          {labelLog && (
                            <Badge variant="secondary" className="text-[7px] h-4 px-1">Printed {labelLog.printCount}×</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                          <span>{items.length} device{items.length !== 1 ? 's' : ''}</span>
                          <span>·</span>
                          <span>{items.filter((i) => i.isDeal).length} deal{items.filter((i) => i.isDeal).length !== 1 ? 's' : ''}</span>
                          <span>·</span>
                          <span>{formatDate(visit.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {purch && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => { e.stopPropagation(); setReprintVisitId(visit.id); }}
                            title="Reprint label"
                          >
                            <Printer className="size-3 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                        {isExpanded ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
                      </div>
                    </button>

                    {/* Expanded device list */}
                    {isExpanded && items.length > 0 && (
                      <div className="px-3 pb-3 border-t border-border/50">
                        <div className="space-y-1.5 mt-2">
                          {items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between px-2.5 py-2 bg-secondary/40 rounded text-[11px]">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium">{item.brand} {item.model}</span>
                                  <Badge
                                    variant={item.isDeal ? 'default' : 'secondary'}
                                    className="text-[7px] h-4 px-1"
                                  >
                                    {item.isDeal ? 'DEAL' : 'NO DEAL'}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                                  <span>{item.category}</span>
                                  <span className="capitalize">· {item.condition}</span>
                                  {item.serialImei && <span>· S/N: {item.serialImei}</span>}
                                </div>
                              </div>
                              <span className="font-mono font-semibold tabular-nums text-[11px] shrink-0 ml-2">
                                {formatCurrency(item.buyPrice * item.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>
                        {purch && (
                          <div className="flex items-center justify-between mt-2 px-2.5 py-1.5 text-[10px]">
                            <span className="text-muted-foreground font-medium">Visit Total</span>
                            <span className="font-mono font-bold tabular-nums text-primary">{formatCurrency(purch.totalAmount)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reprint Label Dialog */}
      <BookLabelDialog
        open={!!reprintVisitId}
        onOpenChange={(open) => { if (!open) setReprintVisitId(null); }}
        customer={customer}
        visit={reprintVisit || null}
        purchase={reprintPurchase || null}
        purchaseItems={reprintPurchaseItems}
        labelLog={reprintLabelLog}
        onPrint={handleReprintConfirm}
      />
    </>
  );
}
