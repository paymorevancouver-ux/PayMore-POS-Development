import { describe, expect, it } from 'vitest';
import {
  applyMarkProcessed,
  applySuccessfulShopifyPublishToInventory,
  inferListingMethodFromRecords,
  labelGenerationStatusPatch,
  listingMethodLabel,
  resolveListingMethod,
  showsManualLabelAction,
  showsShopifyListedActions,
} from './inventoryLifecycle';
import { applyPublishFailure, applyPublishSuccess } from '@/lib/shopify/publish';
import type { InventoryItem } from '@/types';
import type { ShopifyListing } from '@/types/shopify';

const listedItem: Pick<InventoryItem, 'status' | 'listingMethod'> = {
  status: 'listed',
  listingMethod: 'processed_manual',
};

describe('inventory listing lifecycle', () => {
  it('successful Shopify publish marks inventory Listed with listing_method shopify', () => {
    expect(applySuccessfulShopifyPublishToInventory()).toEqual({
      status: 'listed',
      listingMethod: 'shopify',
    });
  });

  it('Mark as Processed moves Non-Listed to Listed with processed_manual', () => {
    const patch = applyMarkProcessed({ employeeId: 'EMP-1', now: '2026-09-04T10:00:00.000Z' });
    expect(patch.status).toBe('listed');
    expect(patch.listingMethod).toBe('processed_manual');
    expect(patch.processedByEmployeeId).toBe('EMP-1');
    expect(patch.processedAt).toBe('2026-09-04T10:00:00.000Z');
  });

  it('Mark as Processed does not include Shopify IDs or listing records', () => {
    const patch = applyMarkProcessed({ employeeId: 'EMP-1' });
    expect(patch).not.toHaveProperty('shopifyProductId');
    expect(JSON.stringify(patch)).not.toMatch(/shopify/i);
  });

  it('Generate Label does not change inventory status', () => {
    expect(labelGenerationStatusPatch()).toEqual({});
    expect(labelGenerationStatusPatch()).not.toHaveProperty('status');
    expect(labelGenerationStatusPatch()).not.toHaveProperty('listingMethod');
  });

  it('Shopify-listed items do not use the manual Generate Label action', () => {
    expect(showsShopifyListedActions({ status: 'listed', listingMethod: 'shopify' })).toBe(true);
    expect(showsManualLabelAction({ status: 'listed', listingMethod: 'shopify' })).toBe(false);
  });

  it('Processed Manual items show Generate Label', () => {
    expect(showsManualLabelAction(listedItem)).toBe(true);
    expect(showsShopifyListedActions(listedItem)).toBe(false);
    expect(listingMethodLabel('processed_manual')).toBe('Processed Manually');
  });

  it('creating a draft / Mark Ready does not mark inventory Listed', () => {
    expect(applySuccessfulShopifyPublishToInventory().status).toBe('listed');
    expect(labelGenerationStatusPatch()).toEqual({});
  });

  it('failed Shopify publish does not produce a Listed inventory patch', () => {
    const listing = {
      id: 'SFL-1',
      storeId: 'STR-001',
      inventoryItemId: 'INV-1',
      status: 'publishing',
      title: 'Phone',
      description: '',
      price: 100,
      compareAtPrice: null,
      quantity: 1,
      condition: 'excellent',
      shopifyVendor: 'Apple',
      shopifyProductType: 'Smartphone',
      sku: 'BC05-000001',
      barcode: '',
      tags: [],
      photos: [],
      attributes: {},
      accessories: [],
      testingResults: {},
      staffNotes: '',
      shopifyProductId: 'gid://shopify/Product/1',
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
    } as ShopifyListing;
    const failed = applyPublishFailure(listing, 'Cost update failed');
    expect(failed.status).toBe('error');
    expect(applyPublishSuccess(listing, {
      shopifyProductId: 'gid://shopify/Product/1',
      shopifyVariantId: 'gid://shopify/ProductVariant/2',
      shopifyInventoryItemId: 'gid://shopify/InventoryItem/3',
    }).status).toBe('active');
  });

  it('backfills listing_method only when the mapping is unambiguous', () => {
    expect(inferListingMethodFromRecords({
      inventoryStatus: 'listed',
      shopifyListings: [{ status: 'active' }],
    })).toBe('shopify');
    expect(inferListingMethodFromRecords({
      inventoryStatus: 'listed',
      shopifyListings: [],
    })).toBe('processed_manual');
    expect(inferListingMethodFromRecords({
      inventoryStatus: 'listed',
      shopifyListings: [{ status: 'draft' }],
    })).toBeNull();
    expect(inferListingMethodFromRecords({
      inventoryStatus: 'available',
      shopifyListings: [{ status: 'active' }],
    })).toBeNull();
  });

  it('resolves stored listing_method before inferred history', () => {
    expect(resolveListingMethod({
      item: { status: 'listed', listingMethod: 'processed_manual' },
      shopifyListings: [{ status: 'active' }],
    })).toBe('processed_manual');
    expect(resolveListingMethod({
      item: { status: 'listed', listingMethod: null },
      shopifyListings: [{ status: 'active' }],
    })).toBe('shopify');
  });
});
