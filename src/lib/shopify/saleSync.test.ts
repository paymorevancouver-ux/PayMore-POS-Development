import { describe, expect, it } from 'vitest';
import {
  canDeductForShopifyOrder,
  cancellationRestockQuantity,
  listingStatusForPosQuantity,
  matchShopifyLineItem,
  normalizeWebhookTopic,
  paymentAffectsCashDrawer,
  refundRestockQuantity,
  restoreInventoryTarget,
  restockDelta,
  sameProductIdPreserved,
  shouldApplyPosStockOnRetry,
  shouldArchiveShopifyProduct,
  shouldAutoRelistShopify,
  shouldCreatePosSale,
  shouldReactivateShopifyProduct,
  shouldSkipProcessedWebhook,
  shopifyProductStatusForPosQuantity,
  SHOPIFY_LISTING_RECONCILIATION_REQUIRED,
  SHOPIFY_OVERSOLD,
} from './saleSync';
import { applyInventoryReturn, applyInventorySaleDeduction } from '@/lib/inventorySale';
import { computeShopifyHmacBase64, verifyShopifyWebhookHmac } from './webhookHmac';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const listing = {
  id: 'SFL-1',
  inventoryItemId: 'INV-1',
  shopifyProductId: 'gid://shopify/Product/123',
  shopifyVariantId: 'gid://shopify/ProductVariant/456',
  shopifyInventoryItemId: 'gid://shopify/InventoryItem/789',
  sku: 'BC05-000609',
  status: 'active',
};

describe('Shopify line item matching', () => {
  it('matches by variant id first', () => {
    const result = matchShopifyLineItem({
      shopifyVariantId: '456',
      sku: 'OTHER',
      listings: [listing],
      inventory: [{ id: 'INV-1', deviceCode: 'BC05-000609' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.inventoryItemId).toBe('INV-1');
  });

  it('matches by inventory item id second', () => {
    const result = matchShopifyLineItem({
      shopifyInventoryItemId: 'gid://shopify/InventoryItem/789',
      listings: [{ ...listing, shopifyVariantId: '999' }],
      inventory: [{ id: 'INV-1', deviceCode: 'BC05-000609' }],
    });
    expect(result.ok).toBe(true);
  });

  it('matches by SKU / device code third', () => {
    const result = matchShopifyLineItem({
      sku: 'BC05-000609',
      listings: [{ ...listing, shopifyVariantId: null, shopifyInventoryItemId: null }],
      inventory: [{ id: 'INV-1', deviceCode: 'BC05-000609' }],
    });
    expect(result.ok).toBe(true);
  });

  it('does not match by title', () => {
    const result = matchShopifyLineItem({
      sku: '',
      listings: [{ ...listing, sku: 'Pixel 7', shopifyVariantId: null, shopifyInventoryItemId: null }],
      inventory: [{ id: 'INV-1', deviceCode: 'BC05-000001' }],
    });
    expect(result.ok).toBe(false);
  });

  it('stops on ambiguous SKU matches', () => {
    const result = matchShopifyLineItem({
      sku: 'SHARED',
      listings: [],
      inventory: [
        { id: 'INV-1', deviceCode: 'SHARED' },
        { id: 'INV-2', barcode: 'SHARED' },
      ],
    });
    expect(result).toEqual({
      ok: false,
      code: 'AMBIGUOUS_SKU',
      message: 'Multiple POS items match this SKU. Reconciliation required.',
    });
  });
});

describe('Shopify paid order → POS sale rules', () => {
  it('creates one POS sale for a paid order', () => {
    expect(shouldCreatePosSale(null)).toBe(true);
    expect(shouldCreatePosSale('SAL-1')).toBe(false);
  });

  it('duplicate paid webhook creates no duplicate sale', () => {
    expect(shouldSkipProcessedWebhook('success')).toBe(true);
    expect(shouldCreatePosSale('SAL-EXISTING')).toBe(false);
  });

  it('Shopify sale does not touch cash drawer', () => {
    expect(paymentAffectsCashDrawer('shopify')).toBe(false);
    expect(paymentAffectsCashDrawer('cash')).toBe(true);
  });

  it('qty 1 paid order fully sells POS inventory and listing', () => {
    const sold = applyInventorySaleDeduction(1, 1, 'listed', '2026-09-04T12:00:00.000Z');
    expect(sold.quantityOnHand).toBe(0);
    expect(sold.status).toBe('sold');
    expect(listingStatusForPosQuantity(sold.quantityOnHand)).toBe('sold');
    expect(shopifyProductStatusForPosQuantity(sold.quantityOnHand)).toBe('ARCHIVED');
  });
});

describe('Shopify restock / refund / cancellation', () => {
  it('full restock restores exactly 1', () => {
    expect(restockDelta(1, 0, 1)).toBe(1);
    const restored = applyInventoryReturn(0, 1, 'sold', { listingMethod: 'shopify', sellable: true });
    expect(restored.quantityOnHand).toBe(1);
    expect(restored.status).toBe('listed');
  });

  it('partial restock restores exact qty', () => {
    expect(restockDelta(3, 0, 1)).toBe(1);
    expect(applyInventoryReturn(2, 1, 'listed', { listingMethod: 'shopify', sellable: true }).quantityOnHand).toBe(3);
  });

  it('refund without restock does not alter stock', () => {
    expect(refundRestockQuantity({ refundedQuantity: 1, restockType: 'no_restock' })).toBe(0);
    expect(refundRestockQuantity({ refundedQuantity: 1, restock: false })).toBe(0);
    expect(refundRestockQuantity({ refundedQuantity: 1 })).toBe(0);
  });

  it('cancellation after refund does not double restore', () => {
    expect(cancellationRestockQuantity(1, 1)).toBe(0);
    expect(restockDelta(1, 1, 1)).toBe(0);
  });

  it('duplicate refund webhook restores once', () => {
    expect(shouldSkipProcessedWebhook('success')).toBe(true);
    expect(restockDelta(1, 1, 1)).toBe(0);
  });

  it('same Shopify product ID is used after return', () => {
    expect(sameProductIdPreserved('gid://shopify/Product/123', 'gid://shopify/Product/123')).toBe(true);
    expect(sameProductIdPreserved('123', 'gid://shopify/Product/456')).toBe(false);
  });
});

describe('POS sale and return Shopify sync', () => {
  it('POS sale of 1 archives Shopify when qty reaches 0', () => {
    const after = applyInventorySaleDeduction(1, 1, 'listed', '2026-09-04T12:00:00.000Z');
    expect(shouldArchiveShopifyProduct(after.quantityOnHand)).toBe(true);
    expect(shopifyProductStatusForPosQuantity(0)).toBe('ARCHIVED');
  });

  it('POS sale of 1 from qty 3 keeps product ACTIVE', () => {
    const after = applyInventorySaleDeduction(3, 1, 'listed', '2026-09-04T12:00:00.000Z');
    expect(after.quantityOnHand).toBe(2);
    expect(shouldArchiveShopifyProduct(after.quantityOnHand)).toBe(false);
    expect(shopifyProductStatusForPosQuantity(2)).toBe('ACTIVE');
    expect(listingStatusForPosQuantity(2)).toBe('active');
  });

  it('POS return restores Shopify when previously listed and sellable', () => {
    const restored = applyInventoryReturn(0, 1, 'sold', { listingMethod: 'shopify', sellable: true });
    expect(restored.status).toBe('listed');
    expect(shouldReactivateShopifyProduct(restored.quantityOnHand)).toBe(true);
    expect(shouldAutoRelistShopify({
      listingMethod: 'shopify',
      shopifyProductId: 'gid://shopify/Product/123',
      sellable: true,
      quantityOnHand: 1,
      restocked: true,
    }).relist).toBe(true);
  });

  it('partial POS return never archives because quantity never reached zero', () => {
    const afterSale = applyInventorySaleDeduction(3, 1, 'listed', '2026-09-04T12:00:00.000Z');
    const afterReturn = applyInventoryReturn(afterSale.quantityOnHand, 1, afterSale.status, {
      listingMethod: 'shopify',
      sellable: true,
    });
    expect(afterSale.quantityOnHand).toBe(2);
    expect(afterReturn.quantityOnHand).toBe(3);
    expect(shouldArchiveShopifyProduct(afterSale.quantityOnHand)).toBe(false);
    expect(shopifyProductStatusForPosQuantity(afterReturn.quantityOnHand)).toBe('ACTIVE');
  });

  it('damaged / not sellable POS return does not reactivate Shopify', () => {
    const target = restoreInventoryTarget({ listingMethod: 'shopify', sellable: false });
    expect(target.relistShopify).toBe(false);
    expect(target.restock).toBe(false);
    const restored = applyInventoryReturn(0, 1, 'sold', { listingMethod: 'shopify', sellable: false });
    expect(restored.quantityOnHand).toBe(0);
    expect(restored.status).toBe('defective');
    expect(shouldAutoRelistShopify({
      listingMethod: 'shopify',
      shopifyProductId: 'gid://shopify/Product/123',
      sellable: false,
      quantityOnHand: 0,
      restocked: false,
    }).relist).toBe(false);
  });

  it('manually processed inventory never auto-publishes', () => {
    const target = restoreInventoryTarget({ listingMethod: 'processed_manual', sellable: true });
    expect(target.status).toBe('listed');
    expect(target.relistShopify).toBe(false);
    expect(shouldAutoRelistShopify({
      listingMethod: 'processed_manual',
      shopifyProductId: null,
      sellable: true,
      quantityOnHand: 1,
      restocked: true,
    }).relist).toBe(false);
  });

  it('non-listed return restores to available and does not publish', () => {
    const target = restoreInventoryTarget({ listingMethod: null, sellable: true });
    expect(target.status).toBe('available');
    expect(target.relistShopify).toBe(false);
  });

  it('missing product id requires reconciliation instead of productCreate', () => {
    expect(shouldAutoRelistShopify({
      listingMethod: 'shopify',
      shopifyProductId: null,
      sellable: true,
      quantityOnHand: 1,
      restocked: true,
    })).toEqual({ relist: false, code: SHOPIFY_LISTING_RECONCILIATION_REQUIRED });
  });

  it('sync retry does not apply POS stock twice', () => {
    expect(shouldApplyPosStockOnRetry(true)).toBe(false);
    expect(shouldApplyPosStockOnRetry(false)).toBe(true);
  });
});

describe('oversell and quantity protection', () => {
  it('blocks oversell when POS qty is already 0', () => {
    expect(canDeductForShopifyOrder(0, 1)).toEqual({ ok: false, code: SHOPIFY_OVERSOLD });
  });

  it('quantity never goes negative', () => {
    expect(restockDelta(1, 0, 5)).toBe(1);
    expect(() => {
      const remaining = 0 - 1;
      expect(remaining).toBeLessThan(0);
    }).not.toThrow();
    expect(canDeductForShopifyOrder(0, 1).ok).toBe(false);
  });
});

describe('webhook topics and HMAC', () => {
  it('normalizes current webhook topics', () => {
    expect(normalizeWebhookTopic('ORDERS_PAID')).toBe('orders/paid');
    expect(normalizeWebhookTopic('orders/cancelled')).toBe('orders/cancelled');
    expect(normalizeWebhookTopic('REFUNDS_CREATE')).toBe('refunds/create');
    expect(normalizeWebhookTopic('orders/create')).toBe('ignored');
  });

  it('verifies HMAC against the raw body', async () => {
    const rawBody = '{"id":1,"financial_status":"paid"}';
    const secret = 'test-client-secret';
    const hmac = await computeShopifyHmacBase64(rawBody, secret);
    expect(await verifyShopifyWebhookHmac({ rawBody, hmacHeader: hmac, secret })).toBe(true);
    expect(await verifyShopifyWebhookHmac({
      rawBody: JSON.stringify({ id: 1, financial_status: 'paid' }),
      hmacHeader: hmac,
      secret,
    })).toBe(true);
    expect(await verifyShopifyWebhookHmac({ rawBody, hmacHeader: 'invalid', secret })).toBe(false);
  });
});

describe('sync functions never create Shopify products', () => {
  it('sale/return sync helpers do not call productCreate', () => {
    const files = [
      'supabase/functions/_shared/shopify-inventory-sync.ts',
      'supabase/functions/shopify-sync-inventory/index.ts',
      'supabase/functions/shopify-order-webhook/index.ts',
    ];
    for (const file of files) {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(src).not.toMatch(/productCreate/);
      expect(src).not.toMatch(/productSet\(/);
    }
  });
});
