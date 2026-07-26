import type {
  Employee, Store, Customer, CustomerVisit, PurchaseTransaction, PurchaseItem,
  TransactionPayment, InventoryItem, SaleTransaction, SaleItem, Return,
  PaymentChange, CashDrawerEntry, AuditLogEntry, LabelPrintLog,
} from '@/types';

export const STORES: Store[] = [
  { id: 'STR-001', name: 'Paymore Surrey', address: '15955 Fraser Highway #103, Surrey, BC V4N 0Y3', phone: '(778) 783-3600', gstNumber: 'GST-827461953', pstNumber: 'PST-103847261' },
  { id: 'STR-002', name: 'Paymore Vancouver', address: '1870 Commercial Dr, Vancouver, BC V5N 4A5', phone: '(604) 555-0202', gstNumber: 'GST-827461954', pstNumber: 'PST-103847262' },
];

// Legacy employees kept for reference — production employees are in migrationData.ts
export const EMPLOYEES: Employee[] = [
  { id: 'E001', fullName: 'Nirmal Singh', email: 'nirmal@paymoresurrey.ca', pin: '5486', role: 'admin', isActive: true, createdAt: '2025-01-01T08:00:00Z' },
  { id: 'E002', fullName: 'Simran Singh', email: 'simran@paymoresurrey.ca', pin: '4695', role: 'manager', isActive: true, createdAt: '2025-01-01T08:00:00Z' },
  { id: 'E003', fullName: 'Suneet Vats', email: 'suneet@paymoresurrey.ca', pin: '8143', role: 'manager', isActive: true, createdAt: '2025-01-01T08:00:00Z' },
  { id: 'E004', fullName: 'Abhishek Pundir', email: 'abhishek@paymoresurrey.ca', pin: '4668', role: 'manager', isActive: true, createdAt: '2025-01-01T08:00:00Z' },
];

// ── Empty production defaults — all real data loaded via migration ──
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
