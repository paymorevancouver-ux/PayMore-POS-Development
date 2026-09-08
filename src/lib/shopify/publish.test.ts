import { describe, expect, it } from 'vitest';
import {
  applyPublishFailure,
  applyPublishStarted,
  applyPublishSuccess,
  approvedDescriptionHtml,
  buildPublicMetafields,
  canFinalizeShopifyLabel,
  canPublishListing,
  categoryIdsMatch,
  chooseInitialVariant,
  claimPublishingTransition,
  costsMatch,
  descriptionHtmlLooksEscaped,
  descriptionToHtml,
  descriptionVerificationIssue,
  mapShopifySuccessPayload,
  productSetCreateOmitsDefaultOption,
  productSetUpdateUsesIdentifier,
  publishStepError,
  sanitizePublishTags,
  sanitizeShopifyError,
  shouldCreateShopifyProduct,
  skuLookupDecision,
  unexpectedVariantCountMessage,
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
    shopifyCategoryId: 'gid://shopify/TaxonomyCategory/aa-1',
    shopifyCategoryName: 'Smart Phones',
    shopifyCategoryFullName: 'Electronics > Communications > Telephony > Mobile & Smart Phones > Smart Phones',
    shopifyCategoryConfirmed: true,
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

  it('keeps the existing Shopify product ID after a later cost/barcode failure', () => {
    const failed = applyPublishFailure(
      listing({ shopifyProductId: 'gid://shopify/Product/1', status: 'publishing' }),
      'Shopify product created, but inventory cost could not be updated.',
    );
    expect(failed.status).toBe('error');
    expect(failed.shopifyProductId).toBe('gid://shopify/Product/1');
    expect(shouldCreateShopifyProduct(failed)).toBe(false);
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

  it('blocks publish when quantity_on_hand is 0', () => {
    const result = validatePublishEligibility({
      listing: listing(),
      inventory: inventory({ quantityOnHand: 0 }),
      otherListings: [],
      holdingPeriodDays: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message === 'This item is no longer in stock and cannot be listed.')).toBe(true);
  });

  it('blocks publish when inventory is already Listed', () => {
    const result = validatePublishEligibility({
      listing: listing(),
      inventory: inventory({ status: 'listed', listingMethod: 'shopify' }),
      otherListings: [],
      holdingPeriodDays: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('already listed'))).toBe(true);
  });

  it('blocks publish when inventory was processed manually', () => {
    const result = validatePublishEligibility({
      listing: listing(),
      inventory: inventory({ status: 'listed', listingMethod: 'processed_manual' }),
      otherListings: [],
      holdingPeriodDays: 0,
    });
    expect(result.valid).toBe(false);
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

  it('passes generated Shopify HTML through unchanged', () => {
    const html = '<div><h1>Title</h1><table><tr><td>Brand</td><td>Apple</td></tr></table></div>';
    expect(descriptionToHtml(html)).toBe(html);
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

  it('rejects publish when the persisted taxonomy category is missing', () => {
    const missing = validatePublishEligibility({
      listing: listing({
        status: 'ready',
        shopifyCategoryId: null,
        shopifyCategoryConfirmed: false,
      }),
      inventory: inventory(),
      otherListings: [],
      holdingPeriodDays: 0,
    });
    expect(missing.valid).toBe(false);
    expect(missing.issues.some((i) => i.message.includes('SHOPIFY_CATEGORY_REQUIRED'))).toBe(true);

    const ready = validatePublishEligibility({
      listing: listing({
        status: 'ready',
        shopifyCategoryId: 'gid://shopify/TaxonomyCategory/el-18-8',
        shopifyCategoryName: 'Video Game Console Cables',
        shopifyCategoryFullName: 'Electronics > Video Game Console Accessories > Video Game Console Cables',
        shopifyCategoryConfirmed: true,
      }),
      inventory: inventory(),
      otherListings: [],
      holdingPeriodDays: 0,
    });
    expect(ready.valid).toBe(true);
  });
});

describe('Description HTML publishing', () => {
  const html = '<div style="font-family:Arial"><h1>Samsung Galaxy S20 FE 5G 128GB</h1></div>';

  it('does not publish literal escaped HTML', () => {
    expect(descriptionHtmlLooksEscaped('&lt;div style=')).toBe(true);
    expect(descriptionHtmlLooksEscaped(html)).toBe(false);
    expect(approvedDescriptionHtml(html)).toBe(html);
    expect(approvedDescriptionHtml(html)).not.toContain('&lt;div');
  });

  it('sends raw approved HTML to descriptionHtml', () => {
    expect(approvedDescriptionHtml(html).startsWith('<div')).toBe(true);
    expect(JSON.stringify(approvedDescriptionHtml(html))).not.toBe(html);
  });

  it('does not double-escape HTML', () => {
    expect(approvedDescriptionHtml('&lt;div&gt;&lt;h1&gt;Title&lt;/h1&gt;&lt;/div&gt;')).toContain('<div>');
    expect(descriptionToHtml(html)).toBe(html);
  });

  it('fails verification when Shopify stored escaped HTML', () => {
    expect(descriptionVerificationIssue(html, '&lt;div style="font-family:Arial">')).toMatch(/DESCRIPTION_VERIFY/);
    expect(descriptionVerificationIssue(html, html)).toBeNull();
  });
});

describe('Idempotent product creation', () => {
  it('persists Shopify IDs conceptually before later steps by refusing create when ID exists', () => {
    const existing = listing({ shopifyProductId: 'gid://shopify/Product/111', status: 'error' });
    expect(shouldCreateShopifyProduct(existing)).toBe(false);
    expect(claimPublishingTransition('error', existing.shopifyProductId)).toBe('continue-existing-product');
  });

  it('retry with existing product ID does not create a new product', () => {
    expect(shouldCreateShopifyProduct(listing({
      status: 'error',
      shopifyProductId: 'gid://shopify/Product/111',
    }))).toBe(false);
  });

  it('second Publish click does not create a product', () => {
    expect(claimPublishingTransition('publishing')).toBe('already-publishing');
    expect(claimPublishingTransition('active', 'gid://shopify/Product/1')).toBe('already-published');
    expect(canPublishListing(listing({ status: 'publishing' })).allowed).toBe(false);
  });

  it('existing SKU detection prevents duplicate product', () => {
    const sku = 'BC05-000609';
    expect(skuLookupDecision(sku, [
      { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/1', sku },
      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/2', sku },
    ]).action).toBe('duplicate');
    expect(skuLookupDecision(sku, [
      { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/1', sku },
    ])).toMatchObject({ action: 'adopt', productId: 'gid://shopify/Product/1' });
    expect(skuLookupDecision(sku, [])).toEqual({ action: 'create' });
  });
});

describe('Single used-device variant', () => {
  it('new product omits Default Title productOptions so Shopify keeps the initial variant', () => {
    expect(productSetCreateOmitsDefaultOption({
      variants: [{ price: '10.00' }],
    })).toBe(false);
    expect(productSetCreateOmitsDefaultOption({
      productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
      variants: [{ optionValues: [{ optionName: 'Title', name: 'Default Title' }] }],
    })).toBe(false);
    expect(productSetCreateOmitsDefaultOption({})).toBe(true);
  });

  it('updates existing products with identifier, never input.id', () => {
    expect(productSetUpdateUsesIdentifier({ id: 'gid://shopify/Product/1' }, {})).toBe(true);
    expect(productSetUpdateUsesIdentifier(null, { id: 'gid://shopify/Product/1' })).toBe(false);
  });

  it('reuses the initial Shopify variant and requires exactly one', () => {
    const initial = chooseInitialVariant([
      { id: 'gid://shopify/ProductVariant/1', title: 'Default Title', sku: 'BC05-000609' },
    ]);
    expect(initial?.id).toBe('gid://shopify/ProductVariant/1');
    expect(unexpectedVariantCountMessage(1)).toBeNull();
    expect(unexpectedVariantCountMessage(2)).toMatch(/VARIANT_VERIFY/);
  });
});

describe('Cost, barcode, and category verification', () => {
  it('builds POS cost for inventoryItemUpdate and matches Shopify unitCost', () => {
    expect(costsMatch(50, '50.00')).toBe(true);
    expect(costsMatch(50, '50.009')).toBe(true);
    expect(costsMatch(50, '12.00')).toBe(false);
    expect(publishStepError('COST_UPDATE', 'Cost must be greater than or equal to 0.')).toMatch(/^COST_UPDATE:/);
  });

  it('keeps SKU as Device Code and barcode as a separate retail value', () => {
    expect(listing().sku).toBe('BC05-000623');
    expect(listing().barcode).not.toBe(listing().sku);
    expect(listing().barcode).toBe('194253726201');
  });

  it('blocks POS/Shopify barcode mismatch and incomplete labels', () => {
    expect(canFinalizeShopifyLabel({
      success: true,
      listingStatus: 'active',
      barcode: '194253726201',
      shopifyProductId: 'gid://shopify/Product/1',
    })).toBe(true);
    expect(canFinalizeShopifyLabel({
      success: true,
      listingStatus: 'error',
      barcode: '194253726201',
      shopifyProductId: 'gid://shopify/Product/1',
    })).toBe(false);
    expect(canFinalizeShopifyLabel({
      success: true,
      listingStatus: 'active',
      barcode: 'BC05-000609',
      shopifyProductId: 'gid://shopify/Product/1',
    })).toBe(false);
  });

  it('requires matching Shopify taxonomy category GIDs', () => {
    const gid = 'gid://shopify/TaxonomyCategory/aa-6-7-7-3';
    expect(categoryIdsMatch(gid, gid)).toBe(true);
    expect(categoryIdsMatch(gid, '')).toBe(false);
    expect(publishStepError('CATEGORY_UPDATE', 'invalid taxonomy category')).toMatch(/^CATEGORY_UPDATE:/);
  });
});

describe('Photo upload and activation gates', () => {
  it('surfaces zero-photo and partial media errors', () => {
    expect(publishStepError('PHOTO_UPLOAD', '0 successful photos. Expected 3.')).toMatch(/^PHOTO_UPLOAD:/);
    expect(publishStepError('PHOTO_UPLOAD[2]', 'staged upload failed')).toMatch(/^PHOTO_UPLOAD\[2\]:/);
  });

  it('does not mark Active until verification would pass', () => {
    const failed = applyPublishFailure(listing({ status: 'publishing', shopifyProductId: 'gid://shopify/Product/1' }), publishStepError('VERIFY', 'Unexpected Shopify variant count.'));
    expect(failed.status).toBe('error');
    expect(failed.shopifyProductId).toBe('gid://shopify/Product/1');
  });

  it('does not finalize a label before barcode and listing success', () => {
    expect(canFinalizeShopifyLabel({
      success: false,
      listingStatus: 'error',
      barcode: '',
      shopifyProductId: 'gid://shopify/Product/1',
    })).toBe(false);
  });
});
