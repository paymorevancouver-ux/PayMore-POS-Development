import { describe, expect, it } from 'vitest';
import { buildSalesHistoryRows, type SalesHistoryInput } from './salesHistory';
import type {
  Customer, InventoryItem, Return, SaleItem, SaleTransaction, TransactionPayment,
} from '@/types';

const patrick: Customer = {
  id: 'CUS-1',
  customerCode: 'C-44021',
  idType: 'drivers-license',
  idNumber: '1234567',
  firstName: 'Patrick',
  middleName: '',
  lastName: 'Donaghy',
  dob: '1980-01-01',
  address1: '1 Main',
  address2: '',
  city: 'Vancouver',
  province: 'BC',
  postalCode: 'V5K1A1',
  phone: '(778) 814-2211',
  email: 'patrick@example.com',
  sex: 'M',
  race: '',
  weight: '',
  height: '',
  notes: '',
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-01T10:00:00Z',
};

const olderSale: SaleTransaction = {
  id: 'SAL-OLD',
  saleCode: 'S-20260801-0001',
  customerId: 'CUS-1',
  employeeId: 'EMP-1',
  storeId: 'STR-001',
  subtotal: 25,
  gstTotal: 1.25,
  pstTotal: 1.75,
  taxTotal: 3,
  totalAmount: 28,
  salesChannel: 'in-store',
  notes: '',
  status: 'completed',
  createdAt: '2026-08-01T10:00:00Z',
  completedAt: '2026-08-01T10:05:00Z',
};

const sale: SaleTransaction = {
  id: 'SAL-1',
  saleCode: 'S-20260810-0042',
  customerId: 'CUS-1',
  employeeId: 'EMP-1',
  storeId: 'STR-001',
  subtotal: 749,
  gstTotal: 37.45,
  pstTotal: 52.43,
  taxTotal: 89.88,
  totalAmount: 838.88,
  salesChannel: 'in-store',
  notes: '',
  status: 'completed',
  createdAt: '2026-08-10T10:00:00Z',
  completedAt: '2026-08-10T10:12:00Z',
};

const otherStoreSale: SaleTransaction = {
  ...olderSale,
  id: 'SAL-X',
  saleCode: 'S-OTHER',
  storeId: 'STR-002',
};

const draftSale: SaleTransaction = {
  ...sale,
  id: 'SAL-DRAFT',
  saleCode: 'S-DRAFT',
  status: 'draft',
  completedAt: null,
};

const phoneItem: SaleItem = {
  id: 'SI-1',
  salesTransactionId: 'SAL-1',
  inventoryItemId: 'INV-1',
  lineNumber: 1,
  category: 'Smartphones',
  brand: 'Apple',
  model: 'iPhone 14',
  serialImei: '356789012345678',
  quantity: 1,
  unitPrice: 699,
  taxMode: 'both',
  gstAmount: 34.95,
  pstAmount: 48.93,
  lineTotal: 782.88,
  costPerUnitSnapshot: 400,
  profitAmount: 299,
};

const chargerItem: SaleItem = {
  id: 'SI-2',
  salesTransactionId: 'SAL-1',
  inventoryItemId: 'INV-2',
  lineNumber: 2,
  category: 'Accessories',
  brand: 'Apple',
  model: 'Charger',
  serialImei: '',
  quantity: 2,
  unitPrice: 25,
  taxMode: 'both',
  gstAmount: 2.5,
  pstAmount: 3.5,
  lineTotal: 56,
  costPerUnitSnapshot: 8,
  profitAmount: 34,
};

const olderItem: SaleItem = {
  ...chargerItem,
  id: 'SI-OLD',
  salesTransactionId: 'SAL-OLD',
  inventoryItemId: undefined,
  quantity: 1,
  unitPrice: 25,
  lineTotal: 28,
};

const inventoryPhone: InventoryItem = {
  id: 'INV-1',
  deviceCode: 'BC05-000123',
  sourcePurchaseItemId: 'PI-1',
  visitId: 'VIS-1',
  category: 'Smartphones',
  brand: 'Apple',
  model: 'iPhone 14',
  serialImei: '356789012345678',
  quantityOnHand: 0,
  costPerUnit: 400,
  expectedSalePrice: 699,
  status: 'sold',
  storeId: 'STR-001',
  acquiredAt: '2026-08-10T10:06:00Z',
  soldAt: '2026-08-10T10:12:00Z',
  notes: '',
  storageLocation: 'R4-R2',
  storageRack: 'R4',
  storageRow: 'R2',
  labelGenerated: true,
  labelGeneratedAt: '2026-08-10T11:00:00Z',
  labelGeneratedBy: 'EMP-1',
  labelPrintCount: 1,
  lastLabelPrintAt: '2026-08-10T11:00:00Z',
  lastLabelPrintBy: 'EMP-1',
};

const inventoryCharger: InventoryItem = {
  ...inventoryPhone,
  id: 'INV-2',
  deviceCode: 'BC05-ACC-009',
  serialImei: '',
  quantityOnHand: 8,
  status: 'listed',
  soldAt: null,
};

const payment: TransactionPayment = {
  id: 'PAY-1',
  transactionType: 'sale',
  transactionId: 'SAL-1',
  lineNumber: 1,
  method: 'debit',
  amount: 838.88,
  reference: '',
  createdAt: '2026-08-10T10:12:00Z',
};

const chargerReturn: Return = {
  id: 'RET-1',
  returnCode: 'R-1',
  sourceTransactionType: 'sale',
  sourceTransactionId: 'SAL-1',
  sourceItemId: 'SI-2',
  customerId: 'CUS-1',
  employeeId: 'EMP-1',
  storeId: 'STR-001',
  reason: 'Customer return',
  returnAmount: 28,
  refundMethod: 'cash',
  status: 'completed',
  createdAt: '2026-08-11T10:00:00Z',
  completedAt: '2026-08-11T10:00:00Z',
};

const input: SalesHistoryInput = {
  sales: [olderSale, sale, otherStoreSale, draftSale],
  saleItems: [phoneItem, chargerItem, olderItem],
  salePayments: [payment],
  inventory: [inventoryPhone, inventoryCharger],
  customers: [patrick],
  returns: [chargerReturn],
  employeesById: new Map([['EMP-1', 'Alex Cashier']]),
  storeId: 'STR-001',
};

describe('salesHistory', () => {
  it('sorts newest completed sale first and keeps STR-001 records only', () => {
    const rows = buildSalesHistoryRows(input);
    expect(rows.map((r) => r.sale.saleCode)).toEqual(['S-20260810-0042', 'S-20260801-0001']);
    expect(rows[0].employeeName).toBe('Alex Cashier');
    expect(rows[0].paymentMethods).toEqual(['Interac / Debit']);
    expect(rows[0].canReprint).toBe(true);
  });

  it('excludes drafts', () => {
    const rows = buildSalesHistoryRows(input);
    expect(rows.some((r) => r.sale.status === 'draft')).toBe(false);
  });

  it('finds a sale by sale code', () => {
    const rows = buildSalesHistoryRows(input, 'S-20260810-0042');
    expect(rows).toHaveLength(1);
    expect(rows[0].customer?.firstName).toBe('Patrick');
  });

  it('finds a sale by product name', () => {
    const rows = buildSalesHistoryRows(input, 'iphone');
    expect(rows).toHaveLength(1);
    expect(rows[0].items[0].productName).toBe('Apple iPhone 14');
  });

  it('finds a sale by IMEI and device ID', () => {
    expect(buildSalesHistoryRows(input, '356789012345678')).toHaveLength(1);
    expect(buildSalesHistoryRows(input, 'BC05-000123')).toHaveLength(1);
  });

  it('finds a sale by customer phone digits and employee name', () => {
    expect(buildSalesHistoryRows(input, '7788142211')).toHaveLength(2);
    expect(buildSalesHistoryRows(input, 'Alex')).toHaveLength(2);
  });

  it('shows sold quantity and partial return status from existing return data', () => {
    const rows = buildSalesHistoryRows(input, 'SAL-1');
    const charger = rows[0].items.find((line) => line.item.model === 'Charger');
    expect(charger?.item.quantity).toBe(2);
    expect(charger?.item.unitPrice).toBe(25);
    expect(rows[0].quantitySold).toBe(3);
    expect(rows[0].returnStatus).toBe('Partially Returned');
    expect(rows[0].canReturn).toBe(true);
  });

  it('filters by payment method and employee', () => {
    const debit = buildSalesHistoryRows(input, '', { datePreset: 'all', paymentMethod: 'debit' });
    expect(debit.map((r) => r.sale.id)).toEqual(['SAL-1']);
    const otherEmp = buildSalesHistoryRows(input, '', { datePreset: 'all', employeeId: 'EMP-9' });
    expect(otherEmp).toHaveLength(0);
  });

  it('filters by custom date range', () => {
    const rows = buildSalesHistoryRows(input, '', {
      datePreset: 'custom',
      customFrom: '2026-08-10',
      customTo: '2026-08-10',
    });
    expect(rows.map((r) => r.sale.id)).toEqual(['SAL-1']);
  });
});
