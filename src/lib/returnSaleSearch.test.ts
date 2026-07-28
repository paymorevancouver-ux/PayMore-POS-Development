import { describe, expect, it } from 'vitest';
import {
  calculateProportionalRefund,
  getReturnEligibility,
  inferReturnedQuantity,
  searchReturnableSales,
} from './returnSaleSearch';
import type { Return, SaleItem, SaleTransaction } from '@/types';

const saleItem: SaleItem = {
  id: 'SI-1',
  salesTransactionId: 'SAL-1',
  lineNumber: 1,
  category: 'Smartphones',
  brand: 'Apple',
  model: 'iPhone 14 Pro',
  serialImei: '356789012345678',
  quantity: 3,
  unitPrice: 500,
  taxMode: 'both',
  gstAmount: 75,
  pstAmount: 105,
  lineTotal: 1680,
  costPerUnitSnapshot: 300,
  profitAmount: 780,
};

const sale: SaleTransaction = {
  id: 'SAL-1',
  saleCode: 'S-20260728-0001',
  employeeId: 'EMP-1',
  storeId: 'STR-001',
  subtotal: 1500,
  gstTotal: 75,
  pstTotal: 105,
  taxTotal: 180,
  totalAmount: 1680,
  salesChannel: 'in-store',
  notes: '',
  status: 'completed',
  createdAt: '2026-07-28T10:00:00Z',
  completedAt: '2026-07-28T10:05:00Z',
};

describe('returnSaleSearch', () => {
  it('finds sales by product name partial match', () => {
    const results = searchReturnableSales('iphone', {
      sales: [sale],
      saleItems: [saleItem],
      inventory: [{ ...saleItem, id: 'INV-1', deviceCode: 'BC05-000452', quantityOnHand: 0 } as never],
      customers: [],
      returns: [],
    });
    expect(results).toHaveLength(1);
    expect(results[0].productName).toContain('iPhone');
  });

  it('calculates partial return eligibility', () => {
    const partialReturn: Return = {
      id: 'RET-1',
      returnCode: 'RTN-1',
      sourceTransactionType: 'sale',
      sourceTransactionId: 'SAL-1',
      sourceItemId: 'SI-1',
      employeeId: 'EMP-1',
      storeId: 'STR-001',
      reason: 'test',
      returnAmount: 560,
      refundMethod: 'cash',
      status: 'completed',
      createdAt: '2026-07-28T11:00:00Z',
      completedAt: '2026-07-28T11:00:00Z',
    };

    const { quantityReturned, quantityEligible } = getReturnEligibility(saleItem, [partialReturn]);
    expect(quantityReturned).toBeGreaterThanOrEqual(1);
    expect(quantityEligible).toBeLessThan(3);
  });

  it('calculates proportional refund for one unit', () => {
    expect(calculateProportionalRefund(saleItem, 1)).toBe(560);
  });
});
