import { useMemo, useRef, useState } from 'react';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import EmployeeVerificationDialog from '@/components/features/EmployeeVerificationDialog';
import { DollarSign, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle, Minus, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatDateTime, round2 } from '@/lib/taxCalc';
import { canAdjustCashDrawer } from '@/lib/employeePin';
import {
  CASH_DRAWER_REASONS,
  DRAWER_RECONCILE_REASON,
  drawerHistoryActionLabel,
  drawerRelatedLabel,
  resolveDrawerReason,
} from '@/lib/cashDrawer';
import type { Employee } from '@/types';

type ManualDrawerAction = 'add' | 'remove' | 'reconcile';

interface PendingDrawerChange {
  action: ManualDrawerAction;
  actionLabel: string;
  signedAmount: number;
  reason: string;
  auditAction: 'DRAWER_ADD' | 'DRAWER_REMOVE' | 'DRAWER_RECONCILE';
  refType?: string;
}

export default function CashDrawerPage() {
  const store = useAuthStore((s) => s.store);
  const getEmployeeName = useAuthStore((s) => s.getEmployeeName);
  const pos = usePosStore();
  const { toast } = useToast();
  const drawer = pos.cashDrawer;

  const [adjAmount, setAdjAmount] = useState('');
  const [reasonValue, setReasonValue] = useState('');
  const [otherNote, setOtherNote] = useState('');

  const [pinOpen, setPinOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState<PendingDrawerChange | null>(null);
  const [verifiedEmployee, setVerifiedEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const pinSucceededRef = useRef(false);

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

  const parsedAmount = Number(adjAmount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const requestPin = (change: PendingDrawerChange) => {
    if (!store) return;
    setPending(change);
    setVerifiedEmployee(null);
    setPinOpen(true);
  };

  const handleAddOrRemove = (action: 'add' | 'remove') => {
    if (!store) return;
    if (!amountValid) {
      toast({ variant: 'destructive', title: 'Enter a valid amount' });
      return;
    }
    const reason = resolveDrawerReason(reasonValue, otherNote);
    if (!reason) {
      toast({ variant: 'destructive', title: 'A reason is required', description: reasonValue === 'other' ? 'Enter a note for Other.' : 'Select a reason before continuing.' });
      return;
    }
    const signedAmount = action === 'add' ? round2(parsedAmount) : round2(-parsedAmount);
    requestPin({
      action,
      actionLabel: action === 'add' ? 'Add Cash' : 'Remove Cash',
      signedAmount,
      reason,
      auditAction: action === 'add' ? 'DRAWER_ADD' : 'DRAWER_REMOVE',
    });
  };

  const handleReconcileFix = () => {
    if (!store || !reconciliation.hasDiscrepancy) return;
    requestPin({
      action: 'reconcile',
      actionLabel: 'Fix Balance',
      signedAmount: round2(-reconciliation.discrepancy),
      reason: DRAWER_RECONCILE_REASON,
      auditAction: 'DRAWER_RECONCILE',
      refType: 'reconciliation',
    });
  };

  const handlePinOpenChange = (open: boolean) => {
    setPinOpen(open);
    if (!open && !pinSucceededRef.current) {
      setPending(null);
      setVerifiedEmployee(null);
    }
    if (!open) pinSucceededRef.current = false;
  };

  const handleVerified = (employee: Employee) => {
    pinSucceededRef.current = true;
    setVerifiedEmployee(employee);
    setConfirmOpen(true);
  };

  const handleConfirmCancel = () => {
    if (saving) return;
    setConfirmOpen(false);
    setVerifiedEmployee(null);
    setPending(null);
  };

  const handleConfirmSave = () => {
    if (savingRef.current || saving) return;
    if (!pending || !verifiedEmployee || !store) return;

    savingRef.current = true;
    setSaving(true);
    try {
      const entry = pos.addDrawerEntry(
        'adjustment',
        pending.signedAmount,
        pending.reason,
        verifiedEmployee.id,
        store.id,
        pending.refType,
      );
      pos.logAction(
        verifiedEmployee.id,
        verifiedEmployee.fullName,
        'Cash Drawer',
        pending.auditAction,
        'drawer',
        entry.id,
        `${pending.actionLabel} ${formatCurrency(Math.abs(pending.signedAmount))} — ${pending.reason}`,
      );
      toast({
        title: pending.action === 'reconcile' ? 'Balance corrected' : `${pending.actionLabel} recorded`,
        description: `${pending.actionLabel} ${formatCurrency(Math.abs(pending.signedAmount))} by ${verifiedEmployee.fullName}`,
      });
      setAdjAmount('');
      setReasonValue('');
      setOtherNote('');
      setConfirmOpen(false);
      setPending(null);
      setVerifiedEmployee(null);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

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
          <CardHeader className="pb-2"><CardTitle className="text-[14px]">Manual Adjustment</CardTitle></CardHeader>
          <CardContent>
            <Label className="text-[11px]">Amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              className="mt-1 h-9 font-mono text-[12px]"
              placeholder="0.00"
            />
            <Label className="text-[11px] mt-2 block">Reason *</Label>
            <Select value={reasonValue || undefined} onValueChange={setReasonValue}>
              <SelectTrigger className="mt-1 h-9 text-[12px]">
                <SelectValue placeholder="Select reason…" />
              </SelectTrigger>
              <SelectContent>
                {CASH_DRAWER_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reasonValue === 'other' && (
              <Input
                value={otherNote}
                onChange={(e) => setOtherNote(e.target.value)}
                className="mt-2 h-9 text-[12px]"
                placeholder="Describe the reason…"
              />
            )}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button onClick={() => handleAddOrRemove('add')} className="h-9" variant="outline">
                <DollarSign className="size-3.5 mr-1.5" />Add Cash
              </Button>
              <Button onClick={() => handleAddOrRemove('remove')} className="h-9" variant="outline">
                <Minus className="size-3.5 mr-1.5" />Remove Cash
              </Button>
            </div>
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
                const related = drawerRelatedLabel(entry);
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className={`size-7 rounded-lg flex items-center justify-center bg-secondary ${style.color}`}><Icon className="size-3.5" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate">{drawerHistoryActionLabel(entry)}</p>
                      {entry.notes && (
                        <p className="text-[11px] text-muted-foreground truncate">Reason: {entry.notes}</p>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                        <span>Employee: {empName(entry.employeeId)}</span>
                        <span>·</span>
                        <span>{formatDateTime(entry.createdAt)}</span>
                        <Badge variant="outline" className="text-[8px] uppercase">{entry.entryType}</Badge>
                        {related && <span>· {related}</span>}
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

      <EmployeeVerificationDialog
        open={pinOpen}
        onOpenChange={handlePinOpenChange}
        onVerified={handleVerified}
        description="Enter your PIN to make this cash drawer change"
        permissionCheck={canAdjustCashDrawer}
        permissionDeniedMessage="You do not have permission to perform this cash drawer action."
      />

      <Dialog open={confirmOpen} onOpenChange={(open) => { if (saving) return; if (!open) handleConfirmCancel(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[16px]">Confirm Cash Drawer Change</DialogTitle>
            <DialogDescription className="text-[13px]">
              Review this change before it is saved.
            </DialogDescription>
          </DialogHeader>
          {pending && verifiedEmployee && (
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Action</span>
                <span className="font-medium">{pending.actionLabel}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-mono font-semibold tabular-nums">{formatCurrency(Math.abs(pending.signedAmount))}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Employee</span>
                <span className="font-medium">{verifiedEmployee.fullName}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Reason</span>
                <span className="font-medium text-right">{pending.reason}</span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleConfirmCancel} disabled={saving}>Cancel</Button>
            <Button onClick={handleConfirmSave} disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
