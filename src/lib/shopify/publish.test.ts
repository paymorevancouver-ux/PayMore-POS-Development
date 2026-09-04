import { describe, expect, it } from 'vitest';
import {
  applyPublishFailure,
  applyPublishStarted,
  applyPublishSuccess,
  buildPublicMetafields,
  canPublishListing,
  claimPublishingTransition,
  descriptionToHtml,
  mapShopifySuccessPayload,
  sanitizePublishTags,
  sanitizeShopifyError,
  shouldCreateShopifyProduct,
  validatePublishEligibility,
  validatePublishPrice,
  validatePublishQuantity,
} from './publish';
import type { InventoryItem } from '@/types';
import type { ShopifyListing } from '@/types/shopify';

function listing(partial: Partial<ShopifyListing> = {}): ShopifyListing {
  return {
    id: 'SFL-1',
    storeId: 'STR-001',
    inventoryItemId: 'INV-1',
    status: 'ready',
    title: 'ASUS ROG Zephyrus G14',
    description: 'Product Overview\n────────\nGaming laptop',
    price: 999.99,
    compareAtPrice: null,
    quantity: 1,
    condition: 'excellent',
    shopifyVendor: 'ASUS',
    shopifyProductType: 'Windows Laptop',
    sku: 'BC05-000623',
    barcode: '194253726201',
    tags: ['ASUS', 'Laptop', 'IMEI 123'],
    photos: ['data:image/jpeg;base64,AAA'],
    attributes: { 'cpu.model': 'Ryzen 9', imei1: '356789012345678', serialNumber: 'SN-1' },
    accessories: [],
    testingResults: {},
    staffNotes: 'Do not publish this',
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

function inventory(partial: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'INV-1',
    deviceCode: 'BC05-000623',
    category: 'Windows Laptop',
    brand: 'ASUS',
    model: 'ROG Zephyrus G14',
    serialImei: 'SN-1',
    quantityOnHand: 1,
    costPerUnit: 400,
    expectedSalePrice: 999.99,
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
    ...partial,
  };
}

describe('Publish button eligibility', () => {
  it('allows publish only when ready', () => {
    expect(canPublishListing(listing({ status: 'ready' })).allowed).toBe(true);
    expect(canPublishListing(listing({ status: 'draft' })).allowed).toBe(false);
    expect(canPublishListing(listing({ status: 'active' })).reason).toBe('Already published');
  });

  it('blocks a second publish while another listing is publishing', () => {
    const result = canPublishListing(listing({ status: 'ready' }), { anyOtherPublishing: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/one item at a time/i);
  });
});

describe('Double-click / claim protection', () => {
  it('claims ready listings and rejects publishing/active', () => {
    expect(claimPublishingTransition('ready')).toBe('claim');
    expect(claimPublishingTransition('publishing')).toBe('already-publishing');
    expect(claimPublishingTransition('active', 'gid://shopify/Product/1')).toBe('already-published');
    expect(claimPublishingTransition('error', 'gid://shopify/Product/1')).toBe('continue-existing-product');
  });

  it('does not create another product when a Shopify product ID exists', () => {
    expect(shouldCreateShopifyProduct(listing({ shopifyProductId: 'gid://shopify/Product/1' }))).toBe(false);
    expect(shouldCreateShopifyProduct(listing())).toBe(true);
  });
});

describe('Publish state transitions', () => {
  it('moves Ready → Publishing', () => {
    expect(applyPublishStarted(listing()).status).toBe('publishing');
  });

  it('moves success → Active and keeps IDs', () => {
    const next = applyPublishSuccess(listing({ status: 'publishing' }), {
      shopifyProductId: 'gid://shopify/Product/1',
      shopifyVariantId: 'gid://shopify/ProductVariant/2',
      shopifyInventoryItemId: 'gid://shopify/InventoryItem/3',
      shopifyHandle: 'asus-g14',
      shopifyAdminUrl: 'https://example.myshopify.com/admin/products/1',
    });
    expect(next.status).toBe('active');
    expect(next.shopifyProductId).toBe('gid://shopify/Product/1');
    expect(next.lastError).toBeNull();
  });

  it('moves failure → Error without exposing tokens', () => {
    const next = applyPublishFailure(listing({ status: 'publishing' }), 'Bearer shpat_abc123 failed');
    expect(next.status).toBe('error');
    expect(next.lastError).not.toContain('shpat_');
    expect(next.lastError).not.toContain('Bearer shpat');
  });
});

describe('Retry behavior', () => {
  it('allows retry from error and continues an existing product', () => {
    expect(canPublishListing(listing({ status: 'error' })).allowed).toBe(true);
    expect(claimPublishingTransition('error', 'gid://shopify/Product/9')).toBe('continue-existing-product');
    expect(shouldCreateShopifyProduct(listing({ status: 'error', shopifyProductId: 'gid://shopify/Product/9' }))).toBe(false);
  });
});

describe('Quantity and price validation', () => {
  it('rejects quantity above POS on-hand', () => {
    const issues = validatePublishQuantity(2, 1);
    expect(issues.some((i) => i.message.includes('cannot exceed'))).toBe(true);
  });

  it('rejects price of 0', () => {
    expect(validatePublishPrice(0).length).toBeGreaterThan(0);
    expect(validatePublishPrice(10)).toEqual([]);
  });

  it('rejects sold/scrapped inventory', () => {
    const sold = validatePublishEligibility({
      listing: listing(),
      inventory: inventory({ status: 'sold', quantityOnHand: 1 }),
      otherListings: [],
      holdingPeriodDays: 0,
    });
    expect(sold.valid).toBe(false);
    expect(sold.issues.some((i) => i.message.includes('sold'))).toBe(true);
  });
});

describe('Internal fields excluded from Shopify payload', () => {
  it('drops IMEI/serial/cost tags and metafields', () => {
    const tags = sanitizePublishTags(['ASUS', 'Laptop', 'IMEI 123', 'Serial Number', 'Cost']);
    expect(tags).toEqual(['ASUS', 'Laptop']);
    const metafields = buildPublicMetafields({
      imei1: '3567',
      serialNumber: 'SN',
      cost: '400',
      'cpu.model': 'Ryzen 9',
      'ram.total': '16GB',
    }, 'excellent');
    const keys = metafields.map((m) => m.key);
    expect(keys).toContain('cpu');
    expect(keys).toContain('ram');
    expect(keys).toContain('condition');
    expect(keys).not.toContain('imei');
    expect(keys).not.toContain('serialNumber');
    expect(metafields.some((m) => String(m.value).includes('3567'))).toBe(false);
  });

  it('converts the employee description to HTML without adding staff notes', () => {
    const html = descriptionToHtml('Product Overview\n────────\nGaming laptop\n\nCondition\n────────\nExcellent');
    expect(html).toContain('<h3>Product Overview</h3>');
    expect(html).toContain('Gaming laptop');
    expect(html).not.toContain('staff');
  });
});

describe('Shopify response mapping', () => {
  it('maps a success payload without tokens', () => {
    const mapped = mapShopifySuccessPayload({
      productId: 'gid://shopify/Product/1',
      variantId: 'gid://shopify/ProductVariant/2',
      inventoryItemId: 'gid://shopify/InventoryItem/3',
      handle: 'asus-g14',
      adminUrl: 'https://example.myshopify.com/admin/products/1',
    });
    expect(mapped.success).toBe(true);
    expect(mapped.status).toBe('active');
    expect(mapped.shopify_product_id).toContain('Product/1');
    expect(JSON.stringify(mapped)).not.toContain('shpat_');
  });

  it('sanitizes Shopify errors', () => {
    expect(sanitizeShopifyError('X-Shopify-Access-Token: shpat_secret boom')).not.toContain('shpat_secret');
  });
});

describe('Duplicate active listing prevention', () => {
  it('fails when another active listing exists for the same inventory item', () => {
    const result = validatePublishEligibility({
      listing: listing({ id: 'SFL-2' }),
      inventory: inventory(),
      otherListings: [listing({ id: 'SFL-1', status: 'active' })],
      holdingPeriodDays: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'duplicate')).toBe(true);
  });
});
