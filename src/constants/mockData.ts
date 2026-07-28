import type {
  Employee, Store, Customer, CustomerVisit, PurchaseTransaction, PurchaseItem,
  TransactionPayment, InventoryItem, SaleTransaction, SaleItem, Return,
  PaymentChange, CashDrawerEntry, AuditLogEntry, LabelPrintLog,
} from '@/types';

/** Single-store permanent ID — PayMore Vancouver */
export const STORE_ID = 'STR-001';

export const STORES: Store[] = [
  {
    id: STORE_ID,
    name: 'PayMore Vancouver',
    address: '4534 Main St, Vancouver, BC',
    phone: '778-375-5900',
    gstNumber: '755658960RT0001',
    pstNumber: 'PST-103847262',
  },
];

// ── Empty production defaults — all real data loaded from database / CSV import ──
export const MOCK_CUSTOMERS: Customer[] = [];
export const MOCK_VISITS: CustomerVisit[] = [];
export const MOCK_PURCHASES: PurchaseTransaction[] = [];
export const MOCK_PURCHASE_ITEMS: PurchaseItem[] = [];
export const MOCK_PURCHASE_PAYMENTS: TransactionPayment[] = [];
export const MOCK_INVENTORY: InventoryItem[] = [];
export const MOCK_SALES: SaleTransaction[] = [];
export const MOCK_SALE_ITEMS: SaleItem[] = [];
export const MOCK_SALE_PAYMENTS: TransactionPayment[] = [];
export const MOCK_DRAWER_ENTRIES: CashDrawerEntry[] = [];
export const MOCK_LABELS: LabelPrintLog[] = [];
export const MOCK_AUDIT_LOG: AuditLogEntry[] = [];
export const MOCK_RETURNS: Return[] = [];
export const MOCK_PAYMENT_CHANGES: PaymentChange[] = [];
