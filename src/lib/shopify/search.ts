import type { InventoryItem } from '@/types';
import type { ShopifyListing } from '@/types/shopify';
import { getAttributeValue } from '@/lib/shopify/attributes';

export function matchesEligibleInventorySearch(item: InventoryItem, query: string, barcode = ''): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const blob = [
    item.deviceCode,
    item.category,
    item.brand,
    item.model,
    item.serialImei,
    item.notes,
    barcode,
    String(getAttributeValue((item.specifications || {}) as Record<string, unknown>, 'upcSku') || ''),
    String(getAttributeValue((item.specifications || {}) as Record<string, unknown>, 'imei1') || ''),
    String(getAttributeValue((item.specifications || {}) as Record<string, unknown>, 'imei2') || ''),
    String(getAttributeValue((item.specifications || {}) as Record<string, unknown>, 'serialNumber') || ''),
  ].join(' ').toLowerCase();
  return blob.includes(q);
}

export function matchesListingSearch(
  listing: ShopifyListing,
  inventory: InventoryItem | undefined,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const blob = [
    listing.title,
    listing.sku,
    listing.barcode,
    listing.shopifyVendor,
    listing.shopifyProductType,
    listing.shopifyProductId || '',
    listing.status,
    inventory?.deviceCode || '',
    inventory?.brand || '',
    inventory?.model || '',
    inventory?.serialImei || '',
    String(getAttributeValue(listing.attributes, 'imei1') || ''),
    String(getAttributeValue(listing.attributes, 'imei2') || ''),
    String(getAttributeValue(listing.attributes, 'serialNumber') || ''),
  ].join(' ').toLowerCase();
  return blob.includes(q);
}
