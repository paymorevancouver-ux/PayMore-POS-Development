export const SHOPIFY_OVERSOLD = 'SHOPIFY_OVERSOLD';
export const SHOPIFY_LISTING_RECONCILIATION_REQUIRED = 'SHOPIFY_LISTING_RECONCILIATION_REQUIRED';

export type ShopifyListingMatch = {
  id: string;
  inventoryItemId: string;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  shopifyInventoryItemId?: string | null;
  sku?: string | null;
  status?: string | null;
};

export type ShopifyInventoryMatch = {
  id: string;
  deviceCode?: string | null;
  barcode?: string | null;
  sku?: string | null;
};

export type LineItemMatchResult =
  | { ok: true; inventoryItemId: string; listingId?: string; shopifyProductId?: string | null }
  | { ok: false; code: 'NO_MATCH' | 'AMBIGUOUS_SKU'; message: string };

export function normalizeShopifyGid(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parts = raw.split('/');
  return parts[parts.length - 1] || raw;
}

export function sameShopifyId(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): boolean {
  const left = normalizeShopifyGid(a);
  const right = normalizeShopifyGid(b);
  return Boolean(left && right && left === right);
}

export function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
}

export function matchShopifyLineItem(input: {
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  shopifyInventoryItemId?: string | null;
  sku?: string | null;
  listings: ShopifyListingMatch[];
  inventory: ShopifyInventoryMatch[];
}): LineItemMatchResult {
  const variantMatches = input.listings.filter((listing) =>
    sameShopifyId(listing.shopifyVariantId, input.shopifyVariantId),
  );
  if (input.shopifyVariantId && variantMatches.length) {
    const inventoryIds = uniqueIds(variantMatches.map((listing) => listing.inventoryItemId));
    if (inventoryIds.length > 1) {
      return { ok: false, code: 'AMBIGUOUS_SKU', message: 'Multiple POS items match this Shopify variant.' };
    }
    const listing = variantMatches[0];
    return {
      ok: true,
      inventoryItemId: listing.inventoryItemId,
      listingId: listing.id,
      shopifyProductId: listing.shopifyProductId || null,
    };
  }

  const inventoryItemMatches = input.listings.filter((listing) =>
    sameShopifyId(listing.shopifyInventoryItemId, input.shopifyInventoryItemId),
  );
  if (input.shopifyInventoryItemId && inventoryItemMatches.length) {
    const inventoryIds = uniqueIds(inventoryItemMatches.map((listing) => listing.inventoryItemId));
    if (inventoryIds.length > 1) {
      return { ok: false, code: 'AMBIGUOUS_SKU', message: 'Multiple POS items match this Shopify inventory item.' };
    }
    const listing = inventoryItemMatches[0];
    return {
      ok: true,
      inventoryItemId: listing.inventoryItemId,
      listingId: listing.id,
      shopifyProductId: listing.shopifyProductId || null,
    };
  }

  const sku = String(input.sku || '').trim().toLowerCase();
  if (!sku) {
    return { ok: false, code: 'NO_MATCH', message: 'Shopify line item could not be matched to POS inventory.' };
  }

  const skuListings = input.listings.filter((listing) => String(listing.sku || '').trim().toLowerCase() === sku);
  const skuInventory = input.inventory.filter((item) => {
    const device = String(item.deviceCode || '').trim().toLowerCase();
    const barcode = String(item.barcode || '').trim().toLowerCase();
    const itemSku = String(item.sku || '').trim().toLowerCase();
    return device === sku || barcode === sku || itemSku === sku;
  });

  const inventoryIds = uniqueIds([
    ...skuListings.map((listing) => listing.inventoryItemId),
    ...skuInventory.map((item) => item.id),
  ]);
  if (inventoryIds.length > 1) {
    return {
      ok: false,
      code: 'AMBIGUOUS_SKU',
      message: 'Multiple POS items match this SKU. Reconciliation required.',
    };
  }
  if (inventoryIds.length === 1) {
    const listing = skuListings.find((row) => row.inventoryItemId === inventoryIds[0]);
    return {
      ok: true,
      inventoryItemId: inventoryIds[0],
      listingId: listing?.id,
      shopifyProductId: listing?.shopifyProductId || null,
    };
  }
  return { ok: false, code: 'NO_MATCH', message: 'Shopify line item could not be matched to POS inventory.' };
}

export function restockDelta(orderedQuantity: number, alreadyRestocked: number, requested: number): number {
  const remaining = Math.max(0, orderedQuantity - Math.max(0, alreadyRestocked));
  return Math.max(0, Math.min(remaining, Math.max(0, requested)));
}

export function cancellationRestockQuantity(orderedQuantity: number, alreadyRestocked: number): number {
  return restockDelta(orderedQuantity, alreadyRestocked, orderedQuantity);
}

export function refundRestockQuantity(input: {
  refundedQuantity: number;
  restockType?: string | null;
  restock?: boolean | null;
}): number {
  if (input.restock === false) return 0;
  const type = String(input.restockType || '').trim().toLowerCase().replace(/-/g, '_');
  if (type === 'no_restock') return 0;
  if (input.restock === true) return Math.max(0, input.refundedQuantity);
  if (type === 'return' || type === 'cancel' || type === 'legacy_restock' || type === 'cancel_restock') {
    return Math.max(0, input.refundedQuantity);
  }
  return 0;
}

export function canDeductForShopifyOrder(available: number, needed: number): {
  ok: boolean;
  code?: typeof SHOPIFY_OVERSOLD;
} {
  if (needed < 1) return { ok: false };
  if (available < needed) return { ok: false, code: SHOPIFY_OVERSOLD };
  return { ok: true };
}

export function listingStatusForPosQuantity(quantityOnHand: number): 'active' | 'sold' {
  return quantityOnHand > 0 ? 'active' : 'sold';
}

export function shopifyProductStatusForPosQuantity(quantityOnHand: number): 'ACTIVE' | 'ARCHIVED' {
  return quantityOnHand > 0 ? 'ACTIVE' : 'ARCHIVED';
}

export function paymentAffectsCashDrawer(method: string | null | undefined): boolean {
  return method === 'cash';
}

export function shouldSkipProcessedWebhook(status: string | null | undefined): boolean {
  const value = String(status || '').toLowerCase();
  return value === 'success' || value === 'processed';
}

export function shouldCreatePosSale(existingPosSaleId: string | null | undefined): boolean {
  return !String(existingPosSaleId || '').trim();
}

export function restoreInventoryTarget(input: {
  listingMethod?: 'shopify' | 'processed_manual' | null;
  sellable: boolean;
}): { status: string; restock: boolean; relistShopify: boolean } {
  if (!input.sellable) {
    return { status: 'defective', restock: false, relistShopify: false };
  }
  if (input.listingMethod === 'shopify') {
    return { status: 'listed', restock: true, relistShopify: true };
  }
  if (input.listingMethod === 'processed_manual') {
    return { status: 'listed', restock: true, relistShopify: false };
  }
  return { status: 'available', restock: true, relistShopify: false };
}

export function shouldAutoRelistShopify(input: {
  listingMethod?: 'shopify' | 'processed_manual' | null;
  shopifyProductId?: string | null;
  sellable: boolean;
  quantityOnHand: number;
  restocked: boolean;
}): { relist: boolean; code?: string } {
  if (!input.restocked || !input.sellable || input.quantityOnHand <= 0) {
    return { relist: false };
  }
  if (input.listingMethod === 'processed_manual' || input.listingMethod !== 'shopify') {
    return { relist: false };
  }
  if (!String(input.shopifyProductId || '').trim()) {
    return { relist: false, code: SHOPIFY_LISTING_RECONCILIATION_REQUIRED };
  }
  return { relist: true };
}

export function normalizeWebhookTopic(topic: string | null | undefined):
  | 'orders/paid'
  | 'orders/cancelled'
  | 'refunds/create'
  | 'ignored' {
  const normalized = String(topic || '').trim().toLowerCase().replace(/_/g, '/');
  if (normalized === 'orders/paid') return 'orders/paid';
  if (normalized === 'orders/cancelled') return 'orders/cancelled';
  if (normalized === 'refunds/create') return 'refunds/create';
  return 'ignored';
}

export function shopifyOrderAdminUrl(domain: string, orderId: string | number): string {
  const host = String(domain || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const numeric = normalizeShopifyGid(orderId);
  if (!host || !numeric) return '';
  return `https://${host}/admin/orders/${numeric}`;
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function generateCode(prefix: string): string {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  return `${prefix}-${dateStr}-${seq}`;
}
