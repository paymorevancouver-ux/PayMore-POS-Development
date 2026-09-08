// ── Role & Enum Types ──
export type EmployeeRole = 'admin' | 'manager' | 'cashier' | 'buyer';
export type DeviceCondition = 'mint' | 'new' | 'open-box' | 'excellent' | 'very-good' | 'good' | 'fair' | 'poor' | 'for-parts';
export type TaxMode = 'both' | 'gst-only' | 'pst-only' | 'exempt';
export type PaymentMethod = 'cash' | 'debit' | 'credit' | 'etransfer' | 'store-credit' | 'other' | 'shopify';
export type SalesChannel = 'in-store' | 'online' | 'phone' | 'marketplace' | 'shopify';
export type InventoryStatus = 'available' | 'listed' | 'sold' | 'reserved' | 'returned' | 'defective' | 'scrapped';
export type VisitType = 'buy' | 'sell' | 'browse' | 'return';
export type BuyItemStatus = 'pending' | 'deal' | 'no-deal' | 'completed';
export type SaleStatus = 'draft' | 'completed' | 'voided' | 'partially-returned';
export type ReturnStatus = 'draft' | 'completed';
export type PaymentChangeStatus = 'draft' | 'completed';
export type PurchaseChangeStatus = 'draft' | 'completed';
export type DrawerEntryType = 'open' | 'close' | 'sale' | 'purchase' | 'return' | 'adjustment' | 'payout';
export type IdType = 'drivers-license' | 'passport' | 'provincial-id' | 'other';

// ── Employee ──
export interface Employee {
  id: string;
  fullName: string;
  email: string;
  pin: string;
  role: EmployeeRole;
  isActive: boolean;
  createdAt: string;
}

// ── Store ──
export interface Store {
  id: string;
  name: string;
  address: string;
  phone: string;
  gstNumber: string;
  pstNumber: string;
}

// ── Customer ──
export interface Customer {
  id: string;
  customerCode: string;
  idType: IdType;
  idNumber: string;
  firstName: string;
  middleName: string;
  lastName: string;
  dob: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email: string;
  sex: string;
  race: string;
  weight: string;
  height: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ── Customer Visit ──
export interface CustomerVisit {
  id: string;
  visitCode: string;
  customerId: string;
  employeeId: string;
  visitType: VisitType;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ── Purchase Transaction ──
export interface PurchaseTransaction {
  id: string;
  visitId: string;
  customerId: string;
  employeeId: string;
  storeId: string;
  subtotal: number;
  taxTotal: number;
  totalAmount: number;
  notes: string;
  status: 'draft' | 'completed' | 'voided';
  createdAt: string;
}

export type TestResult = 'pass' | 'fail' | 'not-tested';

export interface DeviceAccessory {
  id: string;
  included: boolean;
  quantity?: number;
  note?: string;
}

export interface DeviceStorageDrive {
  type: string;
  capacity: string;
}

export interface DeviceLens {
  brand: string;
  model: string;
  focalLength: string;
  maxAperture: string;
  serialNumber: string;
}

/** Structured category-specific attributes stored as JSONB. Missing on older records. */
export interface DeviceSpecifications {
  categoryId?: string;
  modelNumber?: string;
  color?: string;
  upcSku?: string;
  accessories?: DeviceAccessory[];
  otherAccessories?: string;
  tests?: Record<string, TestResult | string>;
  conditionDetails?: Record<string, string>;
  storage?: DeviceStorageDrive[];
  lenses?: DeviceLens[];
  [key: string]: unknown;
}

// ── Purchase Item ──
export interface PurchaseItem {
  id: string;
  purchaseTransactionId: string;
  lineNumber: number;
  category: string;
  brand: string;
  model: string;
  serialImei: string;
  quantity: number;
  buyPrice: number;
  estimatedSalePrice: number;
  isDeal: boolean;
  conditionNotes: string;
  condition: DeviceCondition;
  inscription: string;
  photos: string[];
  specifications?: DeviceSpecifications;
  listingTitle?: string;
  createdAt: string;
}

// ── Transaction Payment (shared for purchases + sales) ──
export interface TransactionPayment {
  id: string;
  transactionType: 'purchase' | 'sale';
  transactionId: string;
  lineNumber: number;
  method: PaymentMethod;
  amount: number;
  reference: string;
  createdAt: string;
}

// ── Inventory Item ──
export interface InventoryItem {
  id: string;
  deviceCode: string;
  sourcePurchaseItemId?: string;
  visitId?: string;
  category: string;
  brand: string;
  model: string;
  serialImei: string;
  barcode?: string | null;
  quantityOnHand: number;
  costPerUnit: number;
  expectedSalePrice: number;
  status: InventoryStatus;
  storeId: string;
  acquiredAt: string;
  soldAt: string | null;
  notes: string;
  // ── Storage Location ──
  storageLocation: string | null;   // full code e.g. 'R1-R5' or 'R7-R1'
  storageRack: string | null;       // e.g. 'R1'..'R9'
  storageRow: string | null;        // e.g. 'R5', 'SR10', 'B2'
  // ── Label Tracking ──
  labelGenerated: boolean;
  labelGeneratedAt: string | null;
  labelGeneratedBy: string | null;
  labelPrintCount: number;
  lastLabelPrintAt: string | null;
  lastLabelPrintBy: string | null;
  listingMethod?: 'shopify' | 'processed_manual' | null;
  processedAt?: string | null;
  processedByEmployeeId?: string | null;
  specifications?: DeviceSpecifications;
  listingTitle?: string;
}

// ── Location History (audit trail for inventory storage moves) ──
export interface LocationHistoryEntry {
  id: string;
  storeId: string;
  inventoryItemId: string;
  oldLocation: string | null;
  newLocation: string;
  movedByEmployeeId: string;
  movedByName: string;
  movedAt: string;
  notes: string;
}

// ── Sale Transaction ──
export interface SaleTransaction {
  id: string;
  saleCode: string;
  customerId?: string;
  employeeId: string;
  storeId: string;
  subtotal: number;
  gstTotal: number;
  pstTotal: number;
  taxTotal: number;
  totalAmount: number;
  salesChannel: SalesChannel;
  notes: string;
  status: SaleStatus;
  createdAt: string;
  completedAt: string | null;
  shopifyOrderId?: string | null;
  shopifyOrderName?: string | null;
  shopifyCustomerName?: string | null;
  shopifyCustomerEmail?: string | null;
  shopifyOrderUrl?: string | null;
}

// ── Sale Item ──
export interface SaleItem {
  id: string;
  salesTransactionId: string;
  inventoryItemId?: string;
  lineNumber: number;
  category: string;
  brand: string;
  model: string;
  serialImei: string;
  quantity: number;
  unitPrice: number;
  taxMode: TaxMode;
  gstAmount: number;
  pstAmount: number;
  lineTotal: number;
  costPerUnitSnapshot: number;
  profitAmount: number;
}

// ── Return ──
export interface Return {
  id: string;
  returnCode: string;
  sourceTransactionType: 'sale' | 'purchase';
  sourceTransactionId: string;
  sourceItemId?: string;
  customerId?: string;
  employeeId: string;
  storeId: string;
  reason: string;
  returnAmount: number;
  refundMethod: PaymentMethod;
  status: ReturnStatus;
  restockSellable?: boolean;
  createdAt: string;
  completedAt: string | null;
}

// ── Payment Change ──
export interface PaymentChange {
  id: string;
  transactionType: 'sale' | 'purchase';
  transactionId: string;
  transactionRef: string;
  oldPaymentJson: TransactionPayment[];
  newPaymentJson: TransactionPayment[];
  reason: string;
  changedByEmployeeId: string;
  storeId: string;
  status: PaymentChangeStatus;
  createdAt: string;
  completedAt: string | null;
}

// ── Purchase Change ──
export interface PurchaseChange {
  id: string;
  purchaseTransactionId: string;
  purchaseItemId: string;
  oldValueJson: Record<string, unknown>;
  newValueJson: Record<string, unknown>;
  reason: string;
  changedByEmployeeId: string;
  storeId: string;
  status: PurchaseChangeStatus;
  createdAt: string;
  completedAt: string | null;
}

// ── Cash Drawer Entry ──
export interface CashDrawerEntry {
  id: string;
  entryCode: string;
  employeeId: string;
  storeId: string;
  entryType: DrawerEntryType;
  referenceType?: string;
  referenceId?: string;
  amount: number;
  balanceAfter: number;
  notes: string;
  createdAt: string;
}

// ── Cash Drawer State ──
export interface CashDrawerState {
  isOpen: boolean;
  openedAt: string | null;
  openedBy: string | null;
  openingBalance: number;
  currentBalance: number;
  entries: CashDrawerEntry[];
}

// ── Labels Print Log ──
export interface LabelPrintLog {
  id: string;
  visitId: string;
  printedByEmployeeId: string;
  printedAt: string;
  printCount: number;
}

// ── Settings ──
export interface Setting {
  id: string;
  key: string;
  value: string;
  updatedAt: string;
}

// ── Audit Log ──
export interface AuditLogEntry {
  id: string;
  actorEmployeeId: string;
  actorName: string;
  module: string;
  action: string;
  recordType: string;
  recordId: string;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  details: string;
  createdAt: string;
}
