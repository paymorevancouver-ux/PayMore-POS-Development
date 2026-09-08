import { describe, expect, it } from 'vitest';
import { applyDraftUpdates } from './prefill';
import {
  clearShopifyCategoryPatch,
  confirmedShopifyCategoryPatch,
  fromShopifyCategoryColumns,
  isShopifyCategoryPersistPatch,
  mergeStaleAutosaveCategory,
  omitCategoryFields,
  persistedCategoryIsPublishable,
  selectedUnconfirmedCategoryPatch,
  shopifyCategoryRequiredMessage,
  shopifyCategoryStatusLabel,
  SHOPIFY_CATEGORY_SAVE_FAILED,
  SHOPIFY_CATEGORY_SAVING,
  toShopifyCategoryColumns,
  unconfirmShopifyCategoryPatch,
  verifyPersistedShopifyCategory,
} from './categoryPersistence';
import type { ShopifyListing } from '@/types/shopify';

const category = {
  id: 'gid://shopify/TaxonomyCategory/el-18-8',
  name: 'Video Game Console Cables',
  fullName: 'Electronics > Video Game Console Accessories > Video Game Console Cables',
};

function listing(partial: Partial<ShopifyListing> = {}): ShopifyListing {
  return {
    id: 'SFL-1',
    storeId: 'STR-001',
    inventoryItemId: 'INV-1',
    status: 'ready',
    title: 'HDMI Cable',
    description: '<div><h1>HDMI Cable</h1></div>',
    price: 20,
    compareAtPrice: null,
    quantity: 1,
    condition: 'excellent',
    shopifyVendor: 'Generic',
    shopifyProductType: 'Cable',
    sku: 'BC05-000700',
    barcode: '405000007001',
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
    createdAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z',
    publishedAt: null,
    lastSyncedAt: null,
    endedAt: null,
    ...partial,
  };
}

describe('taxonomy Confirm persistence', () => {
  it('persists ID, name, fullName, and confirmed=true from the Shopify GID', () => {
    const patch = confirmedShopifyCategoryPatch(category);
    expect(patch.shopifyCategoryId).toBe('gid://shopify/TaxonomyCategory/el-18-8');
    expect(patch.shopifyCategoryName).toBe('Video Game Console Cables');
    expect(patch.shopifyCategoryFullName).toBe('Electronics > Video Game Console Accessories > Video Game Console Cables');
    expect(patch.shopifyCategoryConfirmed).toBe(true);
    expect(patch.shopifyCategoryId).toContain('gid://shopify/TaxonomyCategory/');
    expect(patch.shopifyCategoryId).not.toBe('el-18-8');
  });

  it('maps confirmed fields to the database columns used by publish', () => {
    const confirmed = listing(confirmedShopifyCategoryPatch(category));
    expect(toShopifyCategoryColumns(confirmed)).toEqual({
      shopify_category_id: 'gid://shopify/TaxonomyCategory/el-18-8',
      shopify_category_name: 'Video Game Console Cables',
      shopify_category_full_name: 'Electronics > Video Game Console Accessories > Video Game Console Cables',
      shopify_category_confirmed: true,
    });
    expect(fromShopifyCategoryColumns(toShopifyCategoryColumns(confirmed))).toEqual({
      shopifyCategoryId: 'gid://shopify/TaxonomyCategory/el-18-8',
      shopifyCategoryName: 'Video Game Console Cables',
      shopifyCategoryFullName: 'Electronics > Video Game Console Accessories > Video Game Console Cables',
      shopifyCategoryConfirmed: true,
    });
  });

  it('refresh preserves the confirmed category from database columns', () => {
    const saved = listing(confirmedShopifyCategoryPatch(category));
    const reloaded = listing({
      ...fromShopifyCategoryColumns({
        shopify_category_id: saved.shopifyCategoryId,
        shopify_category_name: saved.shopifyCategoryName,
        shopify_category_full_name: saved.shopifyCategoryFullName,
        shopify_category_confirmed: saved.shopifyCategoryConfirmed,
      }),
    });
    expect(reloaded.shopifyCategoryId).toBe(category.id);
    expect(reloaded.shopifyCategoryConfirmed).toBe(true);
    expect(reloaded.shopifyCategoryFullName).toBe(category.fullName);
  });

  it('debounced autosave does not erase a confirmed category', () => {
    const confirmed = listing(confirmedShopifyCategoryPatch(category));
    const stale = listing({ title: 'Older title', shopifyCategoryId: null, shopifyCategoryConfirmed: false });
    const merged = mergeStaleAutosaveCategory(stale, confirmed);
    expect(merged.shopifyCategoryId).toBe(category.id);
    expect(merged.shopifyCategoryConfirmed).toBe(true);
    expect(applyDraftUpdates(confirmed, { title: 'Newer title' }).shopifyCategoryId).toBe(category.id);
    expect(applyDraftUpdates(confirmed, { title: 'Newer title' }).shopifyCategoryConfirmed).toBe(true);
    const autosave = applyDraftUpdates(confirmed, omitCategoryFields(stale));
    expect(autosave.shopifyCategoryId).toBe(category.id);
    expect(autosave.shopifyCategoryConfirmed).toBe(true);
    expect(omitCategoryFields(stale).shopifyCategoryId).toBeUndefined();
    expect(omitCategoryFields(stale).shopifyCategoryConfirmed).toBeUndefined();
  });

  it('does not treat a local selection as Confirmed until the persisted row verifies', () => {
    const selected = selectedUnconfirmedCategoryPatch(category);
    expect(selected.shopifyCategoryConfirmed).toBe(false);
    expect(shopifyCategoryStatusLabel({ saving: true, selected: true, confirmed: false })).toBe(SHOPIFY_CATEGORY_SAVING);
    expect(shopifyCategoryStatusLabel({ error: SHOPIFY_CATEGORY_SAVE_FAILED, selected: true, confirmed: false })).toBe(SHOPIFY_CATEGORY_SAVE_FAILED);
    expect(shopifyCategoryStatusLabel({ saving: true, confirmed: true, selected: true })).toBe(SHOPIFY_CATEGORY_SAVING);
    expect(shopifyCategoryStatusLabel({ confirmed: true, selected: true })).toBe('Confirmed');
    expect(verifyPersistedShopifyCategory({ id: category.id }, {
      shopifyCategoryId: category.id,
      shopifyCategoryName: category.name,
      shopifyCategoryFullName: category.fullName,
      shopifyCategoryConfirmed: true,
    })).toBe(true);
    expect(verifyPersistedShopifyCategory({ id: category.id }, {
      shopifyCategoryId: category.id,
      shopifyCategoryName: category.name,
      shopifyCategoryFullName: category.fullName,
      shopifyCategoryConfirmed: false,
    })).toBe(false);
    expect(verifyPersistedShopifyCategory({ id: category.id }, {
      shopifyCategoryId: null,
      shopifyCategoryName: null,
      shopifyCategoryFullName: null,
      shopifyCategoryConfirmed: true,
    })).toBe(false);
  });

  it('Change sets confirmed=false and new Confirm restores confirmed=true', () => {
    const confirmed = listing(confirmedShopifyCategoryPatch(category));
    const changed = listing({ ...confirmed, ...unconfirmShopifyCategoryPatch(confirmed) });
    expect(changed.shopifyCategoryId).toBe(category.id);
    expect(changed.shopifyCategoryConfirmed).toBe(false);
    const next = listing({ ...changed, ...confirmedShopifyCategoryPatch({
      id: 'gid://shopify/TaxonomyCategory/el-4-7',
      name: 'Laptops',
      fullName: 'Electronics > Computers > Laptops',
    }) });
    expect(next.shopifyCategoryId).toBe('gid://shopify/TaxonomyCategory/el-4-7');
    expect(next.shopifyCategoryConfirmed).toBe(true);
    expect(listing({ ...next, ...clearShopifyCategoryPatch() }).shopifyCategoryId).toBeNull();
    expect(listing({ ...next, ...clearShopifyCategoryPatch() }).shopifyCategoryConfirmed).toBe(false);
  });

  it('publish reads persisted category and rejects null category', () => {
    expect(persistedCategoryIsPublishable(listing())).toBe(false);
    expect(shopifyCategoryRequiredMessage(listing())).toContain('category_id_present=false');
    expect(shopifyCategoryRequiredMessage(listing())).toContain('category_confirmed=false');
    expect(persistedCategoryIsPublishable(listing(confirmedShopifyCategoryPatch(category)))).toBe(true);
    expect(listingHasGid(listing(confirmedShopifyCategoryPatch(category)).shopifyCategoryId)).toBe(true);
    expect(isShopifyCategoryPersistPatch(confirmedShopifyCategoryPatch(category))).toBe(true);
    expect(isShopifyCategoryPersistPatch({ title: 'x' })).toBe(false);
  });

  it('publish accepts a real persisted taxonomy GID', () => {
    const ready = listing({
      ...confirmedShopifyCategoryPatch(category),
      status: 'ready',
    });
    expect(ready.shopifyCategoryId).toBe('gid://shopify/TaxonomyCategory/el-18-8');
    expect(persistedCategoryIsPublishable(ready)).toBe(true);
    expect(shopifyCategoryRequiredMessage({
      shopify_category_id: null,
      shopify_category_confirmed: false,
    })).toMatch(/SHOPIFY_CATEGORY_REQUIRED: category_id_present=false, category_confirmed=false/);
  });
});

function listingHasGid(value?: string | null): boolean {
  return /^gid:\/\/shopify\/TaxonomyCategory\/[A-Za-z0-9-]+$/.test(String(value || ''));
}
