import { describe, expect, it } from 'vitest';
import {
  appendCustomerNote,
  formatStorageLocation,
  getCustomerDeviceHistory,
  getCustomerLifetimeStats,
  parseCustomerNotes,
  type Customer360Input,
} from './customer360';
import type { Customer, InventoryItem, PurchaseItem, PurchaseTransaction } from '@/types';

const customer: Customer = {
  id: 'CUS-1',
  customerCode: 'C-44021',
  idType: 'drivers-license',
  idNumber: '1234567',
  firstName: 'Patrick',
  middleName: '',
  lastName: 'Donaghy',
  dob: '1980-01-01',
  address1: '',
  address2: '',
  city: '',
  province: 'BC',
  postalCode: '',
  phone: '7788142211',
  email: 'patrick@example.com',
  sex: '',
  race: '',
  weight: '',
  height: '',
  notes: 'VIP',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const purchase: PurchaseTransaction = {
  id: 'PUR-1', visitId: 'VIS-1', customerId: 'CUS-1', employeeId: 'EMP-1',
  storeId: 'STR-001', subtotal: 400, taxTotal: 0, totalAmount: 400, notes: '',
  status: 'completed', createdAt: '2026-08-10T10:00:00Z',
};

const item: PurchaseItem = {
  id: 'PI-1', purchaseTransactionId: 'PUR-1', lineNumber: 1, category: 'Smartphones',
  brand: 'Apple', model: 'iPhone 14', serialImei: '356789012345678', quantity: 1,
  buyPrice: 400, estimatedSalePrice: 800, isDeal: true, conditionNotes: 'Good',
  condition: 'good', inscription: '', photos: [], createdAt: '2026-08-10T10:00:00Z',
};

const inv: InventoryItem = {
  id: 'INV-1', deviceCode: 'BC05-000846', sourcePurchaseItemId: 'PI-1', visitId: 'VIS-1',
  category: 'Smartphones', brand: 'Apple', model: 'iPhone 14', serialImei: '356789012345678',
  quantityOnHand: 1, costPerUnit: 400, expectedSalePrice: 699, status: 'listed',
  storeId: 'STR-001', acquiredAt: '2026-08-10T10:06:00Z', soldAt: null, notes: '',
  storageLocation: 'R4-R2', storageRack: 'R4', storageRow: 'R2',
  labelGenerated: true, labelGeneratedAt: '2026-08-10T11:00:00Z', labelGeneratedBy: 'EMP-1',
  labelPrintCount: 1, lastLabelPrintAt: null, lastLabelPrintBy: null,
};

const input: Customer360Input = {
  customer,
  visits: [],
  purchases: [purchase],
  purchaseItems: [item],
  purchasePayments: [],
  inventory: [inv],
  sales: [],
  saleItems: [],
  salePayments: [],
  returns: [],
  auditLog: [],
  employeesById: new Map([['EMP-1', 'Alex']]),
};

describe('customer360', () => {
  it('connects a purchased device to current inventory status and rack', () => {
    const devices = getCustomerDeviceHistory(input);
    expect(devices[0].deviceId).toBe('BC05-000846');
    expect(devices[0].currentStatus).toBe('Live');
    expect(devices[0].currentLocation).toBe('Rack 4 / R2');
    expect(devices[0].transactionType).toBe('Sold to PayMore');
  });

  it('computes buy percentage from existing offer vs estimate', () => {
    const stats = getCustomerLifetimeStats(input);
    expect(stats.averageBuyPercentage).toBe(50);
    expect(stats.amountPaidToCustomer).toBe(400);
    expect(stats.devicesSoldToStore).toBe(1);
  });

  it('appends notes without overwriting history', () => {
    const next = appendCustomerNote('VIP', 'Called about trade-in', 'Alex', '2026-08-20T12:00:00Z');
    expect(next).toContain('VIP');
    expect(next).toContain('Called about trade-in');
    expect(parseCustomerNotes(next)).toHaveLength(2);
  });

  it('formats rack location from inventory fields', () => {
    expect(formatStorageLocation(inv)).toBe('Rack 4 / R2');
  });
});
