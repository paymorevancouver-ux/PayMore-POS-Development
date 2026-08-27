import { describe, expect, it } from 'vitest';
import { buildVisitHistoryRows, type VisitHistoryInput } from './visitHistory';
import type {
  Customer, CustomerVisit, InventoryItem, PurchaseItem, PurchaseTransaction, TransactionPayment,
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

const olderVisit: CustomerVisit = {
  id: 'VIS-OLD',
  visitCode: 'BC-02-099',
  customerId: 'CUS-1',
  employeeId: 'EMP-1',
  visitType: 'buy',
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

const otherStorePurchase: PurchaseTransaction = {
  ...purchase,
  id: 'PUR-X',
  visitId: 'VIS-OLD',
  storeId: 'STR-002',
  createdAt: '2026-08-01T10:05:00Z',
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
  conditionNotes: 'Screen wear',
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

const payment: TransactionPayment = {
  id: 'PAY-1',
  transactionType: 'purchase',
  transactionId: 'PUR-1',
  lineNumber: 1,
  method: 'cash',
  amount: 400,
  reference: '',
  createdAt: '2026-08-10T10:10:00Z',
};

const input: VisitHistoryInput = {
  visits: [olderVisit, visit],
  customers: [patrick],
  purchases: [purchase, otherStorePurchase],
  purchaseItems: [purchaseItem],
  purchasePayments: [payment],
  inventory: [inventory],
  employeesById: new Map([['EMP-1', 'Alex Buyer']]),
  storeId: 'STR-001',
};

describe('visitHistory', () => {
  it('sorts newest visit first and keeps STR-001 records only', () => {
    const rows = buildVisitHistoryRows(input);
    expect(rows.map((r) => r.visit.visitCode)).toEqual(['BC-02-100']);
    expect(rows[0].employeeName).toBe('Alex Buyer');
    expect(rows[0].paymentMethods).toEqual(['Cash']);
    expect(rows[0].canReprint).toBe(true);
  });

  it('finds a visit by customer name', () => {
    const rows = buildVisitHistoryRows(input, 'Patrick');
    expect(rows).toHaveLength(1);
    expect(rows[0].visit.visitCode).toBe('BC-02-100');
  });

  it('finds a visit by visit code', () => {
    const rows = buildVisitHistoryRows(input, 'BC-02-100');
    expect(rows[0].customer?.customerCode).toBe('C-44021');
  });

  it('finds a visit by device ID', () => {
    const rows = buildVisitHistoryRows(input, 'BC05-000846');
    expect(rows).toHaveLength(1);
    expect(rows[0].devices[0].currentStatus).toBe('Live');
    expect(rows[0].devices[0].currentLocation).toBe('Rack 4 / R2');
  });

  it('finds a visit by IMEI', () => {
    const rows = buildVisitHistoryRows(input, '356789012345678');
    expect(rows).toHaveLength(1);
  });

  it('finds a visit by purchase ID and phone digits', () => {
    expect(buildVisitHistoryRows(input, 'PUR-1')).toHaveLength(1);
    expect(buildVisitHistoryRows(input, '7788142211')).toHaveLength(1);
  });
});
