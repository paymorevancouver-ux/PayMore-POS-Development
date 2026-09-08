import { describe, expect, it } from 'vitest';
import {
  buildInventorySearchText,
  filterInventoryByStatus,
  getInventoryLifecycleLabel,
  matchesInventorySearch,
} from './inventorySearch';
import type { InventoryItem } from '@/types';

const sample: InventoryItem = {
  id: 'INV-1',
  deviceCode: 'BC05-000846',
  category: 'Smartphones',
  brand: 'Apple',
  model: 'iPhone 14 Pro',
  serialImei: '356789012345678',
  quantityOnHand: 1,
  costPerUnit: 400,
  expectedSalePrice: 699,
  status: 'listed',
  storeId: 'STR-001',
  acquiredAt: '2026-07-28T10:00:00Z',
  soldAt: null,
  notes: '',
  storageLocation: 'V, A',
  storageRack: 'V',
  storageRow: 'A',
  labelGenerated: true,
  labelGeneratedAt: '2026-07-28T10:00:00Z',
  labelGeneratedBy: 'EMP-1',
  labelPrintCount: 1,
  lastLabelPrintAt: '2026-07-28T10:00:00Z',
  lastLabelPrintBy: 'EMP-1',
};

describe('inventorySearch', () => {
  it('matches product name across statuses', () => {
    expect(matchesInventorySearch(sample, 'iphone')).toBe(true);
  });

  it('matches retail barcode', () => {
    expect(matchesInventorySearch({ ...sample, barcode: '405000006234' }, '405000006234')).toBe(true);
  });

  it('matches lifecycle status keyword', () => {
    expect(matchesInventorySearch({ ...sample, status: 'sold' }, 'sold')).toBe(true);
    expect(getInventoryLifecycleLabel('listed')).toBe('Listed');
  });

  it('filters by internal status value', () => {
    expect(filterInventoryByStatus(sample, 'listed')).toBe(true);
    expect(filterInventoryByStatus(sample, 'sold')).toBe(false);
    expect(filterInventoryByStatus({ ...sample, listingMethod: 'shopify' }, 'shopify_listed')).toBe(true);
    expect(filterInventoryByStatus({ ...sample, listingMethod: 'processed_manual' }, 'processed_manual')).toBe(true);
    expect(filterInventoryByStatus({ ...sample, quantityOnHand: 0 }, 'sold_out')).toBe(true);
  });

  it('includes sale code in search blob', () => {
    const text = buildInventorySearchText(sample, { saleCode: 'S-20260728-0001' });
    expect(text).toContain('s-20260728-0001');
  });
});
