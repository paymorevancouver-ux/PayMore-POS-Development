import { describe, expect, it } from 'vitest';
import {
  drawerHistoryActionLabel,
  drawerRelatedLabel,
  resolveDrawerReason,
} from './cashDrawer';
import type { CashDrawerEntry } from '@/types';

function entry(overrides: Partial<CashDrawerEntry>): CashDrawerEntry {
  return {
    id: 'DRE-1',
    entryCode: 'DR-1',
    employeeId: 'EMP-NITESH',
    storeId: 'STR-001',
    entryType: 'adjustment',
    amount: -100,
    balanceAfter: 400,
    notes: 'Bank deposit',
    createdAt: '2026-08-27T10:00:00Z',
    ...overrides,
  };
}

describe('cashDrawer helpers', () => {
  it('requires a reason and Other note', () => {
    expect(resolveDrawerReason('', '')).toBeNull();
    expect(resolveDrawerReason('other', '')).toBeNull();
    expect(resolveDrawerReason('other', '  Count mismatch  ')).toBe('Count mismatch');
    expect(resolveDrawerReason('bank-deposit', '')).toBe('Bank deposit');
  });

  it('labels manual add/remove and reconciliation', () => {
    expect(drawerHistoryActionLabel(entry({ amount: 50 }))).toBe('Add Cash');
    expect(drawerHistoryActionLabel(entry({ amount: -100 }))).toBe('Remove Cash');
    expect(drawerHistoryActionLabel(entry({ referenceType: 'reconciliation', amount: -12 }))).toBe('Fix Balance');
  });

  it('labels automatic sale and purchase movements', () => {
    expect(drawerHistoryActionLabel(entry({ entryType: 'sale', amount: 40 }))).toBe('Cash Sale');
    expect(drawerHistoryActionLabel(entry({ entryType: 'purchase', amount: -200 }))).toBe('Cash Purchase');
  });

  it('shows related sale and purchase IDs', () => {
    expect(drawerRelatedLabel(entry({ referenceType: 'sale', referenceId: 'SAL-1' }))).toBe('Related Sale ID: SAL-1');
    expect(drawerRelatedLabel(entry({ referenceType: 'purchase', referenceId: 'PUR-1' }))).toBe('Related Purchase ID: PUR-1');
    expect(drawerRelatedLabel(entry({ referenceType: 'reconciliation' }))).toBeNull();
  });
});
