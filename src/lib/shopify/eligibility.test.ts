import { describe, expect, it } from 'vitest';
import {
  evaluateShopifyEligibility,
  getEligibleInventory,
  nonListedEmployeeActions,
} from './eligibility';
import { OUT_OF_STOCK_LISTING_MESSAGE } from '@/lib/inventoryLifecycle';
import type { InventoryItem } from '@/types';
import type { ShopifyListing } from '@/types/shopify';

function inventory(partial: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'INV-1',
    deviceCode: 'BC05-000623',
    category: 'Smartphones',
    brand: 'Apple',
    model: 'iPhone 14',
    serialImei: '356789012345678',
    quantityOnHand: 1,
    costPerUnit: 400,
    expectedSalePrice: 699,
    status: 'available',
    storeId: 'STR-001',
    acquiredAt: '2026-07-01T00:00:00.000Z',
    soldAt: null,
    notes: '',
    storageLocation: null,
    storageRack: null,
    storageRow: null,
    labelGenerated: false,
    labelGeneratedAt: null,
    labelGeneratedBy: null,
    labelPrintCount: 0,
    lastLabelPrintAt: null,
    lastLabelPrintBy: null,
    listingMethod: null,
    ...partial,
  };
}

function listing(partial: Partial<ShopifyListing> = {}): ShopifyListing {
  return {
    id: 'SFL-1',
    storeId: 'STR-001',
    inventoryItemId: 'INV-1',
    status: 'draft',
    title: 'iPhone 14',
    description: '',
    price: 699,
    compareAtPrice: null,
    quantity: 1,
    condition: 'excellent',
    shopifyVendor: 'Apple',
    shopifyProductType: 'Smartphone',
    sku: 'BC05-000623',
    barcode: '',
    tags: [],
    photos: [],
    attributes: {},
    accessories: [],
    testingResults: {},
    staffNotes: '',
    shopifyCategoryId: null,
    shopifyCategoryName: null,
    shopifyCategoryFullName: null,
    shopifyCategoryConfirmed: false,
    shopifyProductId: null,
    shopifyVariantId: null,
    shopifyInventoryItemId: null,
    shopifyHandle: null,
    shopifyUrl: null,
    lastError: null,
    createdByEmployeeId: 'EMP-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    publishedAt: null,
    lastSyncedAt: null,
    endedAt: null,
    ...partial,
  };
}

const holdingPeriodDays = 0;

describe('Auto Lister eligibility', () => {
  it('includes Non-Listed in-stock items after holding', () => {
    const item = inventory();
    const result = evaluateShopifyEligibility({ inventory: item, listings: [], holdingPeriodDays });
    expect(result.eligible).toBe(true);
    expect(getEligibleInventory([item], [], holdingPeriodDays)).toEqual([item]);
  });

  it('excludes Listed items', () => {
    const result = evaluateShopifyEligibility({
      inventory: inventory({ status: 'listed', listingMethod: 'shopify' }),
      listings: [],
      holdingPeriodDays,
    });
    expect(result.eligible).toBe(false);
  });

  it('excludes Sold Out quantity', () => {
    const result = evaluateShopifyEligibility({
      inventory: inventory({ quantityOnHand: 0 }),
      listings: [],
      holdingPeriodDays,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(OUT_OF_STOCK_LISTING_MESSAGE);
  });

  it('excludes sold inventory', () => {
    const result = evaluateShopifyEligibility({
      inventory: inventory({ status: 'sold', quantityOnHand: 0 }),
      listings: [],
      holdingPeriodDays,
    });
    expect(result.eligible).toBe(false);
  });

  it('excludes scrapped inventory', () => {
    const result = evaluateShopifyEligibility({
      inventory: inventory({ status: 'scrapped', quantityOnHand: 1 }),
      listings: [],
      holdingPeriodDays,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/scrapped/i);
  });

  it('excludes Shopify Active listings', () => {
    const result = evaluateShopifyEligibility({
      inventory: inventory(),
      listings: [listing({ status: 'active' })],
      holdingPeriodDays,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/already listed on shopify/i);
  });

  it('excludes Shopify Publishing listings', () => {
    const result = evaluateShopifyEligibility({
      inventory: inventory(),
      listings: [listing({ status: 'publishing' })],
      holdingPeriodDays,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/publishing/i);
  });

  it('quantity_on_hand = 0 prevents Auto Lister selection', () => {
    expect(getEligibleInventory([inventory({ quantityOnHand: 0 })], [], holdingPeriodDays)).toEqual([]);
  });

  it('hides Non-Listed actions while holding is incomplete', () => {
    const actions = nonListedEmployeeActions({
      inventory: inventory({ acquiredAt: new Date().toISOString() }),
      listings: [],
      holdingPeriodDays: 30,
    });
    expect(actions.openInAutoLister).toBe(false);
    expect(actions.markAsProcessed).toBe(false);
    expect(actions.holding.completed).toBe(false);
  });

  it('creating a draft / Mark Ready does not mark inventory Listed', () => {
    const item = inventory({ status: 'available' });
    expect(evaluateShopifyEligibility({
      inventory: item,
      listings: [listing({ status: 'draft' })],
      holdingPeriodDays,
    }).eligible).toBe(true);
    expect(evaluateShopifyEligibility({
      inventory: item,
      listings: [listing({ status: 'ready' })],
      holdingPeriodDays,
    }).eligible).toBe(true);
    expect(item.status).toBe('available');
    expect(item.listingMethod ?? null).toBeNull();
  });

  it('shows Open in Auto Lister and Mark as Processed for eligible Non-Listed items', () => {
    const actions = nonListedEmployeeActions({
      inventory: inventory(),
      listings: [],
      holdingPeriodDays,
    });
    expect(actions.openInAutoLister).toBe(true);
    expect(actions.markAsProcessed).toBe(true);
  });

  it('excludes processed-manually inventory', () => {
    const result = evaluateShopifyEligibility({
      inventory: inventory({ listingMethod: 'processed_manual' }),
      listings: [],
      holdingPeriodDays,
    });
    expect(result.eligible).toBe(false);
  });
});
