import { describe, expect, it } from 'vitest';
import {
  calculatePaymentChangeDrawerDelta,
  getCashTotal,
  getPaymentsForTransaction,
  paymentsMatchTransaction,
  paymentsToEditableSplit,
  validatePaymentChangeRecord,
} from './paymentChange';
import type { PaymentChange, TransactionPayment } from '@/types';

function payment(
  overrides: Partial<TransactionPayment> & Pick<TransactionPayment, 'transactionType' | 'transactionId' | 'method' | 'amount'>,
): TransactionPayment {
  return {
    id: overrides.id ?? 'PAY-1',
    lineNumber: 1,
    reference: '',
    createdAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

const purchasePayments: TransactionPayment[] = [
  payment({
    id: 'PAY-PUR',
    transactionType: 'purchase',
    transactionId: 'PUR-mtkh0j77sisg',
    method: 'cash',
    amount: 445,
  }),
];

const salePayments: TransactionPayment[] = [
  payment({
    id: 'PAY-SALE-B',
    transactionType: 'sale',
    transactionId: 'SAL-mtj3gynxod3b',
    method: 'cash',
    amount: 350,
  }),
  payment({
    id: 'PAY-SALE-A',
    transactionType: 'sale',
    transactionId: 'SAL-other',
    method: 'cash',
    amount: 700,
  }),
];

describe('paymentChange transaction resolution', () => {
  it('TEST A: unrelated purchase cash does not appear on sale lookup', () => {
    const resolved = getPaymentsForTransaction(
      salePayments,
      purchasePayments,
      'sale',
      'SAL-mtj3gynxod3b',
    );
    expect(getCashTotal(resolved)).toBe(350);
    expect(resolved.some((p) => p.transactionId === 'PUR-mtkh0j77sisg')).toBe(false);
    expect(getCashTotal(resolved)).not.toBe(445);
  });

  it('TEST B: two sales resolve independently by sale.id', () => {
    const saleA = getPaymentsForTransaction(salePayments, purchasePayments, 'sale', 'SAL-other');
    const saleB = getPaymentsForTransaction(salePayments, purchasePayments, 'sale', 'SAL-mtj3gynxod3b');
    expect(getCashTotal(saleA)).toBe(700);
    expect(getCashTotal(saleB)).toBe(350);
  });

  it('TEST E: cash lookup requires transaction identity, not method alone', () => {
    const allCash = [...salePayments, ...purchasePayments].filter((p) => p.method === 'cash');
    expect(allCash).toHaveLength(3);
    expect(getCashTotal(allCash)).toBe(1495);

    const scoped = getPaymentsForTransaction(salePayments, purchasePayments, 'sale', 'SAL-mtj3gynxod3b');
    expect(getCashTotal(scoped)).toBe(350);
  });

  it('rejects payment lines from another transaction', () => {
    const mixed = [
      payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'cash', amount: 350 }),
      payment({ transactionType: 'purchase', transactionId: 'PUR-1', method: 'cash', amount: 445 }),
    ];
    expect(paymentsMatchTransaction(mixed, 'sale', 'SAL-1')).toBe(false);
  });
});

describe('paymentChange drawer math', () => {
  it('sale cash to debit returns cash to drawer (current cash removed)', () => {
    const current = [payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'cash', amount: 100 })];
    const updated = [payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'debit', amount: 100 })];
    expect(calculatePaymentChangeDrawerDelta('sale', current, updated)).toBe(-100);
  });

  it('purchase cash to debit puts cash back in drawer', () => {
    const current = [payment({ transactionType: 'purchase', transactionId: 'PUR-1', method: 'cash', amount: 100 })];
    const updated = [payment({ transactionType: 'purchase', transactionId: 'PUR-1', method: 'debit', amount: 100 })];
    expect(calculatePaymentChangeDrawerDelta('purchase', current, updated)).toBe(100);
  });

  it('pre-fills editable split from current on-file payments', () => {
    const current = [
      payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'cash', amount: 60 }),
      payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'debit', amount: 40, reference: 'ref1' }),
    ];
    expect(paymentsToEditableSplit(current)).toEqual([
      { method: 'cash', amount: 60, reference: '' },
      { method: 'debit', amount: 40, reference: 'ref1' },
    ]);
  });

  it('sale split change adjusts only cash delta', () => {
    const current = [
      payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'cash', amount: 60 }),
      payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'debit', amount: 40 }),
    ];
    const updated = [
      payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'cash', amount: 40 }),
      payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'debit', amount: 60 }),
    ];
    expect(calculatePaymentChangeDrawerDelta('sale', current, updated)).toBe(-20);
  });

  it('sale cash decrease removes money from drawer', () => {
    const oldPayments = [payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'cash', amount: 350 })];
    const newPayments = [payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'cash', amount: 300 })];
    expect(calculatePaymentChangeDrawerDelta('sale', oldPayments, newPayments)).toBe(-50);
  });

  it('sale cash increase adds money to drawer', () => {
    const oldPayments = [payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'cash', amount: 350 })];
    const newPayments = [payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'cash', amount: 400 })];
    expect(calculatePaymentChangeDrawerDelta('sale', oldPayments, newPayments)).toBe(50);
  });

  it('purchase cash decrease returns money to drawer', () => {
    const oldPayments = [payment({ transactionType: 'purchase', transactionId: 'PUR-1', method: 'cash', amount: 445 })];
    const newPayments = [payment({ transactionType: 'purchase', transactionId: 'PUR-1', method: 'cash', amount: 400 })];
    expect(calculatePaymentChangeDrawerDelta('purchase', oldPayments, newPayments)).toBe(45);
  });

  it('purchase cash increase removes more money from drawer', () => {
    const oldPayments = [payment({ transactionType: 'purchase', transactionId: 'PUR-1', method: 'cash', amount: 445 })];
    const newPayments = [payment({ transactionType: 'purchase', transactionId: 'PUR-1', method: 'cash', amount: 500 })];
    expect(calculatePaymentChangeDrawerDelta('purchase', oldPayments, newPayments)).toBe(-55);
  });
});

describe('paymentChange record validation', () => {
  it('blocks completing an already completed change', () => {
    const pc: PaymentChange = {
      id: 'PCH-1',
      transactionType: 'sale',
      transactionId: 'SAL-1',
      transactionRef: 'S-1',
      oldPaymentJson: [payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'cash', amount: 350 })],
      newPaymentJson: [payment({ transactionType: 'sale', transactionId: 'SAL-1', method: 'cash', amount: 300 })],
      reason: 'test',
      changedByEmployeeId: 'EMP-1',
      storeId: 'STR-001',
      status: 'completed',
      createdAt: '2026-09-01T10:00:00Z',
      completedAt: '2026-09-01T10:01:00Z',
    };
    expect(validatePaymentChangeRecord(pc)).toMatch(/already been completed/i);
  });
});
