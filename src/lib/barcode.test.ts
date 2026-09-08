import { describe, expect, it } from 'vitest';
import { labelBarcodeValue, labelHeadline } from './barcode';
import type { InventoryItem } from '@/types';

const item: InventoryItem = {
  id: 'INV-1',
  deviceCode: 'BC05-000623',
  category: 'Apple iPhone',
  brand: 'Apple',
  model: 'iPhone 15 Pro',
  serialImei: '356789012345678',
  barcode: '405000006234',
  quantityOnHand: 1,
  costPerUnit: 50,
  expectedSalePrice: 799.99,
  status: 'available',
  storeId: 'STR-001',
  acquiredAt: '2026-07-01T00:00:00.000Z',
  soldAt: null,
  notes: '',
  storageLocation: 'R1-R5',
  storageRack: 'R1',
  storageRow: 'R5',
  labelGenerated: true,
  labelGeneratedAt: null,
  labelGeneratedBy: null,
  labelPrintCount: 0,
  lastLabelPrintAt: null,
  lastLabelPrintBy: null,
};

describe('Shopify label barcode', () => {
  it('encodes the POS retail barcode, not device code, IMEI, or Shopify IDs', () => {
    expect(labelBarcodeValue(item)).toBe('405000006234');
    expect(labelHeadline(item)).toBe('BC05-000623');
    expect(labelBarcodeValue(item)).not.toBe(item.deviceCode);
    expect(labelBarcodeValue(item)).not.toBe(item.serialImei);
    expect(labelBarcodeValue({ ...item, barcode: '' })).toBe('');
    expect(labelHeadline({ ...item, barcode: '' })).toBe('BC05-000623');
  });
});
