import { describe, expect, it } from 'vitest';
import { applyDraftUpdates, buildDraftListing } from './prefill';
import type { InventoryItem, PurchaseItem } from '@/types';

const inventory: InventoryItem = {
  id: 'INV-1',
  deviceCode: 'BC05-000846',
  sourcePurchaseItemId: 'PI-1',
  category: 'Apple iPhone',
  brand: 'Apple',
  model: 'iPhone 15 Pro',
  serialImei: '356789012345678',
  quantityOnHand: 1,
  costPerUnit: 400,
  expectedSalePrice: 799,
  status: 'available',
  storeId: 'STR-001',
  acquiredAt: '2026-07-01T10:00:00Z',
  soldAt: null,
  notes: '',
  storageLocation: 'V, A',
  storageRack: 'V',
  storageRow: 'A',
  labelGenerated: true,
  labelGeneratedAt: null,
  labelGeneratedBy: null,
  labelPrintCount: 0,
  lastLabelPrintAt: null,
  lastLabelPrintBy: null,
  specifications: {
    categoryId: 'apple-iphone',
    color: 'Natural Titanium',
    storage: { capacity: '256GB' },
    carrierStatus: 'Unlocked',
    upcSku: '194253726201',
  },
};

const purchase: PurchaseItem = {
  id: 'PI-1',
  purchaseTransactionId: 'PUR-1',
  lineNumber: 1,
  category: 'Apple iPhone',
  brand: 'Apple',
  model: 'iPhone 15 Pro',
  serialImei: '356789012345678',
  quantity: 1,
  buyPrice: 400,
  estimatedSalePrice: 799,
  isDeal: true,
  conditionNotes: '',
  condition: 'excellent',
  inscription: '',
  photos: ['data:image/jpeg;base64,AAA'],
  specifications: inventory.specifications,
  createdAt: '2026-07-01T10:00:00Z',
};

describe('draft persistence helpers', () => {
  it('prefills a draft from inventory without inventing a new SKU', () => {
    const draft = buildDraftListing({
      id: 'SFL-1',
      storeId: 'STR-001',
      employeeId: 'EMP-1',
      inventory,
      purchaseItem: purchase,
      now: '2026-08-30T12:00:00.000Z',
    });
    expect(draft.status).toBe('draft');
    expect(draft.sku).toBe('BC05-000846');
    expect(draft.barcode).toBe('194253726201');
    expect(draft.price).toBe(799);
    expect(draft.quantity).toBe(1);
    expect(draft.shopifyVendor).toBe('Apple');
    expect(draft.shopifyProductType).toBe('Smartphone');
    expect(draft.shopifyCategoryId).toBeNull();
    expect(draft.shopifyCategoryConfirmed).toBe(false);
    expect(draft.photos).toEqual(['data:image/jpeg;base64,AAA']);
    expect(draft.attributes.color).toBe('Natural Titanium');
    expect(draft.title).toContain('iPhone 15 Pro');
    expect(draft.description).toContain('Items included in this sale:');
    expect(draft.accessories.some((a) => a.id === 'device' && a.included)).toBe(true);
    expect(draft.cosmeticConditionKey).toBe('VERY_GOOD');
    expect(draft.description).not.toContain('356789012345678');
    expect(draft.description.toLowerCase()).not.toContain('cost');
  });

  it('keeps identity fields when applying later edits', () => {
    const draft = buildDraftListing({
      id: 'SFL-1',
      storeId: 'STR-001',
      employeeId: 'EMP-1',
      inventory,
      purchaseItem: purchase,
      now: '2026-08-30T12:00:00.000Z',
    });
    const saved = applyDraftUpdates(draft, { title: 'Edited title', price: 750 }, '2026-08-30T13:00:00.000Z');
    expect(saved.id).toBe('SFL-1');
    expect(saved.inventoryItemId).toBe('INV-1');
    expect(saved.title).toBe('Edited title');
    expect(saved.price).toBe(750);
    expect(saved.updatedAt).toBe('2026-08-30T13:00:00.000Z');
    expect(saved.photos).toEqual(draft.photos);
  });

  it('does not use IMEI or serial as the listing barcode and keeps SKU as device code', () => {
    const draft = buildDraftListing({
      id: 'SFL-2',
      storeId: 'STR-001',
      employeeId: 'EMP-1',
      inventory: {
        ...inventory,
        barcode: '',
        serialImei: '356789012345678',
        specifications: { upcSku: '356789012345678' },
      },
      now: '2026-08-30T12:00:00.000Z',
    });
    expect(draft.sku).toBe('BC05-000846');
    expect(draft.barcode).toBe('');
  });
});
