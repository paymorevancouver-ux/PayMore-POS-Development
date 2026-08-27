import { describe, expect, it } from 'vitest';
import {
  buildCustomerListRows,
  buildCustomerSearchBlob,
  matchesCustomerSearch,
  storewideCustomerKpis,
  type CustomerSearchInput,
} from './customerSearch';
import type {
  Customer, CustomerVisit, InventoryItem, PurchaseItem, PurchaseTransaction,
  Return, SaleItem, SaleTransaction,
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

const visit: CustomerVisit = {
  id: 'VIS-1',
  visitCode: 'BC-02-100',
  customerId: 'CUS-1',
  employeeId: 'EMP-1',
  visitType: 'buy',
  notes: '',
  createdAt: '2026-08-10T10:00:00Z',
  updatedAt: '2026-08-10T10:00:00Z',
};

const purchase: PurchaseTransaction = {
  id: 'PUR-1',
  visitId: 'VIS-1',
  customerId: 'CUS-1',
  employeeId: 'EMP-1',
  storeId: 'STR-001',
  subtotal: 400,
  taxTotal: 0,
  totalAmount: 400,
  notes: '',
  status: 'completed',
  createdAt: '2026-08-10T10:05:00Z',
};

const purchaseItem: PurchaseItem = {
  id: 'PI-1',
  purchaseTransactionId: 'PUR-1',
  lineNumber: 1,
  category: 'Smartphones',
  brand: 'Apple',
  model: 'iPhone 14',
  serialImei: '356789012345678',
  quantity: 1,
  buyPrice: 400,
  estimatedSalePrice: 699,
  isDeal: true,
  conditionNotes: '',
  condition: 'good',
  inscription: '',
  photos: [],
  createdAt: '2026-08-10T10:05:00Z',
};

const inventory: InventoryItem = {
  id: 'INV-1',
  deviceCode: 'BC05-000846',
  sourcePurchaseItemId: 'PI-1',
  visitId: 'VIS-1',
  category: 'Smartphones',
  brand: 'Apple',
  model: 'iPhone 14',
  serialImei: '356789012345678',
  quantityOnHand: 1,
  costPerUnit: 400,
  expectedSalePrice: 699,
  status: 'listed',
  storeId: 'STR-001',
  acquiredAt: '2026-08-10T10:06:00Z',
  soldAt: null,
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

const sale: SaleTransaction = {
  id: 'SAL-1',
  saleCode: 'S-20260812-0001',
  customerId: 'CUS-1',
  employeeId: 'EMP-1',
  storeId: 'STR-001',
  subtotal: 100,
  gstTotal: 5,
  pstTotal: 7,
  taxTotal: 12,
  totalAmount: 112,
  salesChannel: 'in-store',
  notes: '',
  status: 'completed',
  createdAt: '2026-08-12T10:00:00Z',
  completedAt: '2026-08-12T10:01:00Z',
};

const saleItem: SaleItem = {
  id: 'SI-1',
  salesTransactionId: 'SAL-1',
  inventoryItemId: 'INV-OTHER',
  lineNumber: 1,
  category: 'Accessories',
  brand: 'Anker',
  model: 'Charger',
  serialImei: 'ANK-1',
  quantity: 1,
  unitPrice: 100,
  taxMode: 'both',
  gstAmount: 5,
  pstAmount: 7,
  lineTotal: 112,
  costPerUnitSnapshot: 20,
  profitAmount: 80,
};

const ret: Return = {
  id: 'RET-1',
  returnCode: 'R-20260813-0001',
  sourceTransactionType: 'sale',
  sourceTransactionId: 'SAL-1',
  sourceItemId: 'SI-1',
  customerId: 'CUS-1',
  employeeId: 'EMP-1',
  storeId: 'STR-001',
  reason: 'Changed mind',
  returnAmount: 112,
  refundMethod: 'cash',
  status: 'completed',
  createdAt: '2026-08-13T10:00:00Z',
  completedAt: '2026-08-13T10:00:00Z',
};

const input: CustomerSearchInput = {
  customers: [patrick],
  visits: [visit],
  purchases: [purchase],
  purchaseItems: [purchaseItem],
  inventory: [inventory],
  sales: [sale],
  saleItems: [saleItem],
  returns: [ret],
};

describe('customerSearch', () => {
  it('finds Patrick by first name', () => {
    const rows = buildCustomerListRows(input, 'Patrick');
    expect(rows).toHaveLength(1);
    expect(rows[0].customer.lastName).toBe('Donaghy');
  });

  it('finds a customer by partial phone digits', () => {
    const rows = buildCustomerListRows(input, '778814');
    expect(rows).toHaveLength(1);
  });

  it('finds a customer by device ID', () => {
    const rows = buildCustomerListRows(input, 'BC05-000846');
    expect(rows).toHaveLength(1);
  });

  it('finds a customer by IMEI / serial', () => {
    expect(buildCustomerListRows(input, '356789012345678')).toHaveLength(1);
  });

  it('finds a customer by visit, purchase, sale, and return IDs', () => {
    expect(buildCustomerListRows(input, 'BC-02-100')).toHaveLength(1);
    expect(buildCustomerListRows(input, 'PUR-1')).toHaveLength(1);
    expect(buildCustomerListRows(input, 'S-20260812-0001')).toHaveLength(1);
    expect(buildCustomerListRows(input, 'R-20260813-0001')).toHaveLength(1);
  });

  it('is case-insensitive and supports compact device codes', () => {
    const blob = buildCustomerSearchBlob(patrick, input);
    expect(matchesCustomerSearch(blob, 'patrick')).toBe(true);
    expect(matchesCustomerSearch(blob, 'BC05000846')).toBe(true);
  });

  it('calculates list stats from existing transactions', () => {
    const rows = buildCustomerListRows(input, '');
    expect(rows[0].visitCount).toBe(1);
    expect(rows[0].devicesPurchasedFromCustomer).toBe(1);
    expect(rows[0].devicesSoldToCustomer).toBe(1);
    expect(rows[0].totalPaidToCustomer).toBe(400);
    expect(rows[0].totalCustomerSpend).toBe(112);
  });

  it('computes storewide KPIs without inventing values', () => {
    const kpis = storewideCustomerKpis(input);
    expect(kpis.totalCustomers).toBe(1);
    expect(kpis.devicesPurchased).toBe(1);
    expect(kpis.devicesSold).toBe(1);
    expect(kpis.lifetimePurchaseValue).toBe(400);
  });
});
