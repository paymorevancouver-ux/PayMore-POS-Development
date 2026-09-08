import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/database';
import { useShopifyListerStore } from '@/stores/shopifyListerStore';
import { confirmedShopifyCategoryPatch, pickShopifyCategoryFields } from '@/lib/shopify/categoryPersistence';
import type { ShopifyListing } from '@/types/shopify';

vi.mock('@/lib/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/database')>();
  return {
    ...actual,
    db: {
      ...actual.db,
      updateShopifyListing: vi.fn(),
      saveShopifyListingCategory: vi.fn(),
    },
  };
});

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
    status: 'draft',
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

describe('Shopify category persistence via the lister store', () => {
  beforeEach(() => {
    vi.mocked(db.updateShopifyListing).mockReset();
    vi.mocked(db.saveShopifyListingCategory).mockReset();
    useShopifyListerStore.setState({
      listings: [listing()],
      lastSavedAt: null,
    });
  });

  it('autosave omits category columns so a stale snapshot cannot clear a confirmed category', async () => {
    const confirmed = listing(confirmedShopifyCategoryPatch(category));
    useShopifyListerStore.setState({ listings: [confirmed] });
    vi.mocked(db.updateShopifyListing).mockResolvedValue(true);

    const saved = await useShopifyListerStore.getState().saveListing(
      confirmed,
      listing({ title: 'Edited title', shopifyCategoryId: null, shopifyCategoryConfirmed: false }),
    );

    expect(saved?.title).toBe('Edited title');
    expect(saved?.shopifyCategoryId).toBe(category.id);
    expect(saved?.shopifyCategoryConfirmed).toBe(true);
    const payload = vi.mocked(db.updateShopifyListing).mock.calls[0]?.[1];
    expect(payload?.shopifyCategoryId).toBeUndefined();
    expect(payload?.shopifyCategoryConfirmed).toBeUndefined();
    expect(useShopifyListerStore.getState().listings[0].shopifyCategoryConfirmed).toBe(true);
    expect(useShopifyListerStore.getState().listings[0].shopifyCategoryId).toBe(category.id);
  });

  it('Confirm only updates store state after the persisted row verifies', async () => {
    const draft = listing();
    const persisted = listing({
      ...confirmedShopifyCategoryPatch(category),
      updatedAt: '2026-09-04T01:00:00.000Z',
    });
    vi.mocked(db.saveShopifyListingCategory).mockResolvedValue({ listing: persisted });

    const result = await useShopifyListerStore.getState().saveShopifyCategory(
      draft,
      pickShopifyCategoryFields(confirmedShopifyCategoryPatch(category)),
    );

    expect(result.error).toBeUndefined();
    expect(result.listing?.shopifyCategoryConfirmed).toBe(true);
    expect(result.listing?.shopifyCategoryId).toBe(category.id);
    expect(useShopifyListerStore.getState().listings[0].shopifyCategoryConfirmed).toBe(true);
  });

  it('failed category save does not mark the listing Confirmed', async () => {
    vi.mocked(db.saveShopifyListingCategory).mockResolvedValue({ listing: null, error: 'Could not save Shopify category.' });
    const result = await useShopifyListerStore.getState().saveShopifyCategory(
      listing(),
      pickShopifyCategoryFields(confirmedShopifyCategoryPatch(category)),
    );
    expect(result.listing).toBeNull();
    expect(result.error).toBe('Could not save Shopify category.');
    expect(useShopifyListerStore.getState().listings[0].shopifyCategoryConfirmed).toBe(false);
  });

  it('rejects a returned row that is not actually confirmed in the database', async () => {
    vi.mocked(db.saveShopifyListingCategory).mockResolvedValue({
      listing: listing({
        shopifyCategoryId: category.id,
        shopifyCategoryName: category.name,
        shopifyCategoryFullName: category.fullName,
        shopifyCategoryConfirmed: false,
      }),
    });
    const result = await useShopifyListerStore.getState().saveShopifyCategory(
      listing(),
      pickShopifyCategoryFields(confirmedShopifyCategoryPatch(category)),
    );
    expect(result.listing).toBeNull();
    expect(result.error).toBe('Could not save Shopify category.');
    expect(useShopifyListerStore.getState().listings[0].shopifyCategoryConfirmed).toBe(false);
  });
});
