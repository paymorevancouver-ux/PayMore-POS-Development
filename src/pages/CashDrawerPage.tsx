import { useState, useMemo } from 'react';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { DollarSign, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle, Minus, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatTime, round2 } from '@/lib/taxCalc';
import { db } from '@/lib/database';

export default function CashDrawerPage() {
  const { employee, store } = useAuthStore();
  const pos = usePosStore();
  const { toast } = useToast();
  const drawer = pos.cashDrawer;

  const [adjAmount, setAdjAmount] = useState(0);
  const [adjDesc, setAdjDesc] = useState('');

  // Reconciliation: compute expected balance from entries
  const reconciliation = useMemo(() => {
    if (drawer.entries.length === 0) {
      return { expectedBalance: drawer.openingBalance, discrepancy: 0, hasDiscrepancy: false };
    }
    const sorted = [...drawer.entries].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const lastEntry = sorted[sorted.length - 1];
    const expectedBalance = lastEntry.balanceAfter;
    const discrepancy = round2(drawer.currentBalance - expectedBalance);
    return { expectedBalance, discrepancy, hasDiscrepancy: Math.abs(discrepancy) > 0.005 };
  }, [drawer.entries, drawer.currentBalance, drawer.openingBalance]);

  const handleReconcileFix = async () => {
    if (!store) return;
    const fixed = reconciliation.expectedBalance;
    await db.upsertCashDrawer(store.id, {
      isOpen: drawer.isOpen,
      openedAt: drawer.openedAt,
      openedBy: drawer.openedBy,
      openingBalance: drawer.openingBalance,
      currentBalance: fixed,
    });
    await pos.refreshCashDrawer();
    toast({ title: 'Balance corrected', description: `Set to ${formatCurrency(fixed)}` });
  };

  const handleAdjust = () => {
    if (!employee || !store || adjAmount === 0 || !adjDesc.trim()) {
      toast({ variant: 'destructive', title: 'Enter amount and description' }); return;
    }
    pos.addDrawerEntry('adjustment', adjAmount, adjDesc.trim(), employee.id, store.id);
    pos.logAction(employee.id, employee.fullName, 'Cash Drawer', 'DRAWER_ADJUST', 'drawer', '', `${adjAmount >= 0 ? 'Deposit' : 'Withdrawal'} $${Math.abs(adjAmount).toFixed(2)} — ${adjDesc}`);
    toast({ title: adjAmount > 0 ? 'Deposit recorded' : 'Withdrawal recorded' });
    setAdjAmount(0);
    setAdjDesc('');
  };

  const { getEmployeeName } = useAuthStore();
  const empName = (id: string) => getEmployeeName(id);

  const entryIcons: Record<string, { icon: typeof TrendingUp; color: string }> = {
    open: { icon: ArrowUpCircle, color: 'text-blue-600' },
    close: { icon: ArrowDownCircle, color: 'text-slate-600' },
    sale: { icon: TrendingUp, color: 'text-emerald-600' },
    purchase: { icon: TrendingDown, color: 'text-orange-600' },
    return: { icon: ArrowDownCircle, color: 'text-red-600' },
    adjustment: { icon: ArrowUpCircle, color: 'text-purple-600' },
    payout: { icon: Minus, color: 'text-red-600' },
  };

  return (
    <div className="grid grid-cols-12 gap-5">
      <div className="col-span-4 space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[14px]">Drawer Status</CardTitle></CardHeader>
          <CardContent>
            <div className="text-center py-3">
              <p className="font-mono text-3xl font-bold tabular-nums">{formatCurrency(drawer.currentBalance)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Current Balance</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-muted-foreground">Opening</p>
                <p className="font-mono text-[13px] font-semibold tabular-nums">{formatCurrency(drawer.openingBalance)}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-muted-foreground">Net Change</p>
                <p className={`font-mono text-[13px] font-semibold tabular-nums ${drawer.currentBalance - drawer.openingBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {drawer.currentBalance - drawer.openingBalance >= 0 ? '+' : ''}{formatCurrency(drawer.currentBalance - drawer.openingBalance)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reconciliation */}
        <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[14px] flex items-center gap-2">
                {reconciliation.hasDiscrepancy ? (
                  <AlertTriangle className="size-4 text-amber-500" />
                ) : (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                )}
                Reconciliation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">Stored Balance</span>
                  <span className="font-mono font-semibold tabular-nums">{formatCurrency(drawer.currentBalance)}</span>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">Computed from Entries</span>
                  <span className="font-mono font-semibold tabular-nums">{formatCurrency(reconciliation.expectedBalance)}</span>
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium">Discrepancy</span>
                    <span className={`font-mono font-bold tabular-nums ${
                      reconciliation.hasDiscrepancy ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {reconciliation.discrepancy >= 0 ? '+' : ''}{formatCurrency(reconciliation.discrepancy)}
                    </span>
                  </div>
                </div>
                {reconciliation.hasDiscrepancy ? (
                  <Button onClick={handleReconcileFix} variant="outline" className="w-full h-9 mt-1 border-amber-300 text-amber-700 hover:bg-amber-50">
                    <RefreshCw className="size-3.5 mr-1.5" />Fix Balance
                  </Button>
                ) : (
                  <p className="text-[10px] text-emerald-600 text-center mt-1">Balance is in sync</p>
                )}
              </div>
            </CardContent>
          </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[14px]">Adjustment</CardTitle></CardHeader>
          <CardContent>
            <Label className="text-[11px]">Amount (+ deposit / - withdrawal)</Label>
            <Input type="number" value={adjAmount || ''} onChange={(e) => setAdjAmount(Number(e.target.value))} className="mt-1 h-9 font-mono text-[12px]" />
            <Label className="text-[11px] mt-2 block">Description *</Label>
            <Input value={adjDesc} onChange={(e) => setAdjDesc(e.target.value)} className="mt-1 h-9 text-[12px]" placeholder="Reason…" />
            <Button onClick={handleAdjust} className="w-full mt-3 h-9" variant="outline"><DollarSign className="size-3.5 mr-1.5" />Record</Button>
          </CardContent>
        </Card>
      </div>

      <div className="col-span-8">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[14px]">Transaction Log</CardTitle>
              <Badge variant="outline" className="text-[10px] font-mono">{drawer.entries.length} entries</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-[calc(100vh-230px)] overflow-y-auto">
              {[...drawer.entries].reverse().map((entry) => {
                const style = entryIcons[entry.entryType] || entryIcons.adjustment;
                const Icon = style.icon;
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className={`size-7 rounded-lg flex items-center justify-center bg-secondary ${style.color}`}><Icon className="size-3.5" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate">{entry.notes}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{empName(entry.employeeId)}</span><span>·</span><span>{formatTime(entry.createdAt)}</span>
                        <Badge variant="outline" className="text-[8px] uppercase">{entry.entryType}</Badge>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-mono text-[13px] font-semibold tabular-nums ${entry.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {entry.amount >= 0 ? '+' : ''}{formatCurrency(entry.amount)}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground tabular-nums">Bal: {formatCurrency(entry.balanceAfter)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
