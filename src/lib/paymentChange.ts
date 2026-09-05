import { round2 } from '@/lib/taxCalc';
import type { PaymentChange, TransactionPayment } from '@/types';

export type PaymentChangeTransactionType = PaymentChange['transactionType'];

/** Load payments scoped to one exact transaction ID and type. */
export function getPaymentsForTransaction(
  salePayments: TransactionPayment[],
  purchasePayments: TransactionPayment[],
  transactionType: PaymentChangeTransactionType,
  transactionId: string,
): TransactionPayment[] {
  const source = transactionType === 'sale' ? salePayments : purchasePayments;
  return source.filter(
    (p) => p.transactionType === transactionType && p.transactionId === transactionId,
  );
}

/** Sum cash payment lines for a transaction. */
export function getCashTotal(payments: TransactionPayment[]): number {
  return round2(
    payments.filter((p) => p.method === 'cash').reduce((sum, p) => sum + p.amount, 0),
  );
}

export type EditablePaymentSplit = {
  method: TransactionPayment['method'];
  amount: number;
  reference: string;
};

/** Copy the transaction's current on-file payments into an editable split. */
export function paymentsToEditableSplit(payments: TransactionPayment[]): EditablePaymentSplit[] {
  return payments.map((p) => ({
    method: p.method,
    amount: p.amount,
    reference: p.reference || '',
  }));
}

/**
 * Cash drawer adjustment for a payment change.
 * Compares current on-file cash (before) vs updated cash (after) — not historical sale/purchase totals.
 * Sales: newCash - currentCash (more cash in = positive).
 * Purchases: currentCash - newCash (less payout = cash back in).
 */
export function calculatePaymentChangeDrawerDelta(
  transactionType: PaymentChangeTransactionType,
  oldPayments: TransactionPayment[],
  newPayments: TransactionPayment[],
): number {
  const oldCash = getCashTotal(oldPayments);
  const newCash = getCashTotal(newPayments);
  if (transactionType === 'purchase') {
    return round2(oldCash - newCash);
  }
  return round2(newCash - oldCash);
}

/** Ensure every payment line belongs to the payment-change record's transaction. */
export function paymentsMatchTransaction(
  payments: TransactionPayment[],
  transactionType: PaymentChangeTransactionType,
  transactionId: string,
): boolean {
  return payments.every(
    (p) => p.transactionType === transactionType && p.transactionId === transactionId,
  );
}

/** Validate a payment-change record before completing drawer adjustments. */
export function validatePaymentChangeRecord(pc: PaymentChange): string | null {
  if (pc.status === 'completed') {
    return 'This payment change has already been completed.';
  }
  if (!pc.transactionId.trim()) {
    return 'Payment change is missing a transaction ID.';
  }
  if (!paymentsMatchTransaction(pc.oldPaymentJson, pc.transactionType, pc.transactionId)) {
    return 'Original payment records do not belong to this transaction.';
  }
  if (!paymentsMatchTransaction(pc.newPaymentJson, pc.transactionType, pc.transactionId)) {
    return 'Updated payment records do not belong to this transaction.';
  }
  return null;
}
