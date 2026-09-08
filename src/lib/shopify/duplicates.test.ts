import { describe, expect, it } from 'vitest';
import { canCreateShopifyDraft, checkDuplicateShopifyListing } from './duplicates';
import type { ShopifyListing } from '@/types/shopify';

function listing(partial: Partial<ShopifyListing>): ShopifyListing {
  return {
    id: 'SFL-1',
    storeId: 'STR-001',
    inventoryItemId: 'INV-1',
    status: 'draft',
    title: '',
    description: '',
    price: 0,
    compareAtPrice: null,
    quantity: 1,
    condition: '',
    shopifyVendor: '',
    shopifyProductType: '',
    sku: '',
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
    createdByEmployeeId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    publishedAt: null,
    lastSyncedAt: null,
    endedAt: null,
    ...partial,
  };
}

describe('duplicate Shopify listing protection', () => {
  it('blocks a second listing when one is already active', () => {
    const result = checkDuplicateShopifyListing([
      listing({ status: 'active', shopifyProductId: 'gid://shopify/Product/1' }),
    ], 'INV-1');
    expect(result.action).toBe('already-listed');
    expect(result.message).toBe('Already listed on Shopify');
    expect(canCreateShopifyDraft([listing({ status: 'publishing' })], 'INV-1')).toBe(false);
  });

  it('offers Continue Draft when a draft already exists', () => {
    const existing = listing({ id: 'SFL-draft', status: 'draft' });
    const result = checkDuplicateShopifyListing([existing], 'INV-1');
    expect(result.action).toBe('continue-draft');
    expect(result.listing?.id).toBe('SFL-draft');
    expect(result.message).toBe('Continue Draft');
  });

  it('allows creating a draft when only ended/sold history exists', () => {
    const result = checkDuplicateShopifyListing([
      listing({ id: 'SFL-old', status: 'ended' }),
    ], 'INV-1');
    expect(result.action).toBe('create');
    expect(canCreateShopifyDraft([], 'INV-1')).toBe(true);
  });
});
