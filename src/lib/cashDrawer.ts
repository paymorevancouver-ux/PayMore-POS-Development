import type { CashDrawerEntry } from '@/types';

export const CASH_DRAWER_REASONS = [
  { value: 'bank-deposit', label: 'Bank deposit' },
  { value: 'change-added', label: 'Change added' },
  { value: 'petty-cash', label: 'Petty cash' },
  { value: 'cash-correction', label: 'Cash correction' },
  { value: 'vendor-payment', label: 'Vendor payment' },
  { value: 'drawer-reconciliation', label: 'Drawer reconciliation' },
  { value: 'other', label: 'Other' },
] as const;

export const DRAWER_RECONCILE_REASON = 'Drawer reconciliation';

/** Resolve a selected reason (or Other + note) into the note stored on the drawer entry. */
export function resolveDrawerReason(reasonValue: string, otherNote: string): string | null {
  const selected = reasonValue.trim();
  if (!selected) return null;
  if (selected === 'other') {
    const note = otherNote.trim();
    return note || null;
  }
  const found = CASH_DRAWER_REASONS.find((r) => r.value === selected);
  return found?.label ?? null;
}

export function drawerHistoryActionLabel(entry: CashDrawerEntry): string {
  switch (entry.entryType) {
    case 'open':
      return 'Opening Balance';
    case 'close':
      return 'Closing Balance';
    case 'sale':
      return 'Cash Sale';
    case 'purchase':
      return 'Cash Purchase';
    case 'return':
      return 'Cash Refund';
    case 'payout':
      return 'Paid Out';
    case 'adjustment':
      if (entry.referenceType === 'reconciliation') return 'Fix Balance';
      if (entry.referenceType === 'payment-change') return 'Payment Change';
      if (entry.referenceType === 'purchase-void') return 'Purchase Void Reversal';
      return entry.amount >= 0 ? 'Add Cash' : 'Remove Cash';
    default:
      return entry.entryType;
  }
}

export function drawerRelatedLabel(entry: CashDrawerEntry): string | null {
  if (!entry.referenceId) return null;
  if (entry.referenceType === 'sale') return `Related Sale ID: ${entry.referenceId}`;
  if (entry.referenceType === 'purchase') return `Related Purchase ID: ${entry.referenceId}`;
  if (entry.referenceType === 'return') return `Related Return ID: ${entry.referenceId}`;
  if (entry.referenceType === 'payment-change') return `Related Payment Change ID: ${entry.referenceId}`;
  if (entry.referenceType === 'purchase-void') return `Related Purchase ID: ${entry.referenceId}`;
  if (entry.referenceType === 'reconciliation') return null;
  return entry.referenceType ? `Related ${entry.referenceType}: ${entry.referenceId}` : `Related ID: ${entry.referenceId}`;
}
