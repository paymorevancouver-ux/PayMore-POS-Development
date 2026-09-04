import { getHoldingPeriodStatus } from '@/lib/holdingPeriod';
import { isInternalAttributeKey } from '@/lib/shopify/visibility';
import { getAttributeValue, isUsablePublicValue } from '@/lib/shopify/attributes';
import type { InventoryItem } from '@/types';
import type { ShopifyListing, ShopifyListingStatus } from '@/types/shopify';

export const MAX_SHOPIFY_TAGS = 250;
export const MAX_SHOPIFY_TAG_LENGTH = 255;

export interface PublishEligibilityIssue {
  field: string;
  message: string;
}

export interface PublishEligibilityResult {
  valid: boolean;
  issues: PublishEligibilityIssue[];
}

export type PublishClaimAction =
  | 'claim'
  | 'already-published'
  | 'already-publishing'
  | 'not-ready'
  | 'continue-existing-product';

const RETRYABLE: ShopifyListingStatus[] = ['ready', 'error'];

export function isRetryablePublishStatus(status: ShopifyListingStatus): boolean {
  return RETRYABLE.includes(status);
}

export function canPublishListing(
  listing: Pick<ShopifyListing, 'status'>,
  opts?: { anyOtherPublishing?: boolean },
): { allowed: boolean; reason?: string } {
  if (opts?.anyOtherPublishing) {
    return { allowed: false, reason: 'Another listing is already publishing. Phase 2 allows one item at a time.' };
  }
  if (listing.status === 'publishing') {
    return { allowed: false, reason: 'This listing is already publishing.' };
  }
  if (listing.status === 'active') {
    return { allowed: false, reason: 'Already published' };
  }
  if (listing.status === 'ready') {
    return { allowed: true };
  }
  if (listing.status === 'error') {
    return { allowed: true, reason: 'retry' };
  }
  return { allowed: false, reason: 'Listing must be Ready before publishing.' };
}

export function claimPublishingTransition(
  status: ShopifyListingStatus,
  shopifyProductId?: string | null,
): PublishClaimAction {
  if (status === 'active' && shopifyProductId) return 'already-published';
  if (status === 'active') return 'already-published';
  if (status === 'publishing') return 'already-publishing';
  if (status === 'error' && shopifyProductId) return 'continue-existing-product';
  if (status === 'ready' && shopifyProductId) return 'continue-existing-product';
  if (isRetryablePublishStatus(status)) return 'claim';
  return 'not-ready';
}

export function shouldCreateShopifyProduct(listing: Pick<ShopifyListing, 'shopifyProductId' | 'status'>): boolean {
  return !listing.shopifyProductId;
}

export function validatePublishQuantity(listingQty: number, onHand: number): PublishEligibilityIssue[] {
  const issues: PublishEligibilityIssue[] = [];
  if (!(listingQty > 0)) issues.push({ field: 'quantity', message: 'Listing quantity must be greater than 0.' });
  if (!(onHand > 0)) issues.push({ field: 'quantity_on_hand', message: 'POS quantity on hand must be greater than 0.' });
  if (listingQty > onHand) {
    issues.push({ field: 'quantity', message: 'Listing quantity cannot exceed POS quantity on hand.' });
  }
  return issues;
}

export function validatePublishPrice(price: number): PublishEligibilityIssue[] {
  if (!(Number(price) > 0)) return [{ field: 'price', message: 'Price must be greater than 0.' }];
  return [];
}

export function validatePublishEligibility(input: {
  listing: ShopifyListing;
  inventory?: InventoryItem | null;
  otherListings: ShopifyListing[];
  holdingPeriodDays: number;
  now?: Date;
}): PublishEligibilityResult {
  const issues: PublishEligibilityIssue[] = [];
  const { listing, inventory } = input;

  if (!listing) {
    return { valid: false, issues: [{ field: 'listing', message: 'Listing does not exist.' }] };
  }
  if (!isRetryablePublishStatus(listing.status) && listing.status !== 'publishing') {
    issues.push({ field: 'status', message: `Listing status ${listing.status} cannot be published.` });
  }
  if (!listing.title?.trim()) issues.push({ field: 'title', message: 'Title is required.' });
  issues.push(...validatePublishPrice(listing.price));
  if (!listing.shopifyVendor?.trim()) issues.push({ field: 'vendor', message: 'Vendor is required.' });
  if (!listing.shopifyProductType?.trim()) issues.push({ field: 'productType', message: 'Product type is required.' });
  if (!String(listing.condition || '').trim()) issues.push({ field: 'condition', message: 'Condition is required.' });

  if (!inventory) {
    issues.push({ field: 'inventory', message: 'Inventory item does not exist.' });
  } else {
    issues.push(...validatePublishQuantity(listing.quantity, inventory.quantityOnHand));
    if (inventory.status === 'sold') issues.push({ field: 'inventory', message: 'Inventory item is sold.' });
    if (inventory.status === 'scrapped') issues.push({ field: 'inventory', message: 'Inventory item is scrapped.' });
    const holding = getHoldingPeriodStatus(inventory.acquiredAt, input.holdingPeriodDays, input.now);
    if (!holding.completed) issues.push({ field: 'holding', message: `Holding period is not complete (${holding.label}).` });
  }

  const blocking = input.otherListings.find((row) => (
    row.id !== listing.id
    && row.inventoryItemId === listing.inventoryItemId
    && (row.status === 'active' || row.status === 'publishing')
  ));
  if (blocking) {
    issues.push({ field: 'duplicate', message: 'An active Shopify listing already exists for this inventory item.' });
  }

  return { valid: issues.length === 0, issues };
}

export function sanitizePublishTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags || []) {
    const tag = String(raw || '').trim();
    if (!tag || tag.length > MAX_SHOPIFY_TAG_LENGTH) continue;
    if (isInternalAttributeKey(tag) || /\b(imei|serial number|cost)\b/i.test(tag)) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_SHOPIFY_TAGS) break;
  }
  return out;
}

export function descriptionToHtml(description: string): string {
  const text = (description || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return '';
    const heading = lines[0].replace(/[─\-_=]{3,}/g, '').trim();
    const isHeading = lines.length > 1 && (/^[A-Z][A-Za-z /&]+$/.test(heading) || lines[1]?.match(/^[─\-_=]{3,}$/));
    if (isHeading) {
      const body = lines.slice(1).filter((l) => !/^[─\-_=]{3,}$/.test(l));
      const items = body.filter((l) => l.startsWith('•') || l.startsWith('-'));
      const paras = body.filter((l) => !l.startsWith('•') && !l.startsWith('-'));
      const list = items.length
        ? `<ul>${items.map((i) => `<li>${escapeHtml(i.replace(/^[•\-]\s*/, ''))}</li>`).join('')}</ul>`
        : '';
      const p = paras.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
      return `<h3>${escapeHtml(heading)}</h3>${p}${list}`;
    }
    if (lines.every((l) => l.startsWith('•') || l.startsWith('-'))) {
      return `<ul>${lines.map((i) => `<li>${escapeHtml(i.replace(/^[•\-]\s*/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p>${escapeHtml(lines.join(' '))}</p>`;
  }).join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const METAFIELD_MAP: Array<{ key: string; metafield: string }> = [
  { key: 'cosmeticCondition', metafield: 'condition' },
  { key: 'condition', metafield: 'condition' },
  { key: 'cpu.model', metafield: 'cpu' },
  { key: 'cpu.family', metafield: 'cpu' },
  { key: 'gpu.model', metafield: 'gpu' },
  { key: 'ram.total', metafield: 'ram' },
  { key: 'storage.primaryCapacity', metafield: 'storage' },
  { key: 'display.size', metafield: 'screen_size' },
  { key: 'battery.health', metafield: 'battery_health' },
  { key: 'cameraType', metafield: 'camera_type' },
  { key: 'megapixels', metafield: 'megapixels' },
  { key: 'sensorSize', metafield: 'sensor_size' },
  { key: 'chip', metafield: 'apple_chip' },
];

export function buildPublicMetafields(
  attributes: Record<string, unknown>,
  condition?: string,
): Array<{ namespace: string; key: string; type: string; value: string }> {
  const out: Array<{ namespace: string; key: string; type: string; value: string }> = [];
  const used = new Set<string>();
  if (isUsablePublicValue(condition)) {
    out.push({ namespace: 'paymore', key: 'condition', type: 'single_line_text_field', value: String(condition) });
    used.add('condition');
  }
  for (const map of METAFIELD_MAP) {
    if (used.has(map.metafield)) continue;
    if (isInternalAttributeKey(map.key)) continue;
    const value = getAttributeValue(attributes, map.key);
    if (!isUsablePublicValue(value)) continue;
    out.push({
      namespace: 'paymore',
      key: map.metafield,
      type: 'single_line_text_field',
      value: String(value).slice(0, 255),
    });
    used.add(map.metafield);
  }
  return out.filter((field) => !isInternalAttributeKey(field.key));
}

export function applyPublishStarted(listing: ShopifyListing, now = new Date().toISOString()): ShopifyListing {
  return {
    ...listing,
    status: 'publishing',
    lastError: null,
    updatedAt: now,
  };
}

export function applyPublishSuccess(
  listing: ShopifyListing,
  result: {
    shopifyProductId: string;
    shopifyVariantId: string;
    shopifyInventoryItemId: string;
    shopifyHandle?: string | null;
    shopifyUrl?: string | null;
    shopifyAdminUrl?: string | null;
    shopifyStorefrontUrl?: string | null;
    warning?: string | null;
  },
  now = new Date().toISOString(),
): ShopifyListing {
  return {
    ...listing,
    status: 'active',
    shopifyProductId: result.shopifyProductId,
    shopifyVariantId: result.shopifyVariantId,
    shopifyInventoryItemId: result.shopifyInventoryItemId,
    shopifyHandle: result.shopifyHandle || listing.shopifyHandle,
    shopifyUrl: result.shopifyAdminUrl || result.shopifyUrl || listing.shopifyUrl,
    lastError: null,
    publishedAt: listing.publishedAt || now,
    lastSyncedAt: now,
    updatedAt: now,
  };
}

export function applyPublishFailure(listing: ShopifyListing, message: string, now = new Date().toISOString()): ShopifyListing {
  return {
    ...listing,
    status: 'error',
    lastError: sanitizeShopifyError(message),
    updatedAt: now,
  };
}

export function sanitizeShopifyError(message: string): string {
  return String(message || 'Shopify publish failed')
    .replace(/shpat_[a-zA-Z0-9]+/g, '[redacted]')
    .replace(/shpua_[a-zA-Z0-9]+/g, '[redacted]')
    .replace(/shpss_[a-zA-Z0-9]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/X-Shopify-Access-Token:\s*\S+/gi, '[redacted]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted]');
}

export function mapShopifySuccessPayload(data: {
  productId?: string;
  variantId?: string;
  inventoryItemId?: string;
  handle?: string;
  adminUrl?: string;
  storefrontUrl?: string;
  warnings?: string[];
}) {
  return {
    success: true as const,
    shopify_product_id: data.productId || '',
    shopify_variant_id: data.variantId || '',
    shopify_inventory_item_id: data.inventoryItemId || '',
    shopify_handle: data.handle || '',
    shopify_admin_url: data.adminUrl || '',
    shopify_storefront_url: data.storefrontUrl || '',
    status: 'active' as const,
    warnings: data.warnings || [],
  };
}

export function shopifyAdminProductUrl(storeDomain: string, productLegacyOrGid: string): string {
  const numeric = productLegacyOrGid.includes('/')
    ? productLegacyOrGid.split('/').pop() || ''
    : productLegacyOrGid;
  return `https://${storeDomain}/admin/products/${numeric}`;
}

export function shopifyStorefrontProductUrl(storeDomain: string, handle: string): string {
  const host = storeDomain.replace(/\.myshopify\.com$/i, '');
  return `https://${host}.myshopify.com/products/${handle}`;
}
