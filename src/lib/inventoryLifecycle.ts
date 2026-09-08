import type { InventoryItem, InventoryStatus } from '@/types';
import type { ShopifyListing } from '@/types/shopify';

export type InventoryListingMethod = 'shopify' | 'processed_manual';

export const OUT_OF_STOCK_LISTING_MESSAGE = 'This item is no longer in stock and cannot be listed.';

export function isNonListedInventory(item: Pick<InventoryItem, 'status'>): boolean {
  return item.status === 'available';
}

export function isListedInventory(item: Pick<InventoryItem, 'status'>): boolean {
  return item.status === 'listed';
}

export function isSoldOutInventory(item: Pick<InventoryItem, 'status' | 'quantityOnHand'>): boolean {
  return item.quantityOnHand <= 0 || item.status === 'sold';
}

export function listingMethodOf(item: Pick<InventoryItem, 'listingMethod'>): InventoryListingMethod | null {
  if (item.listingMethod === 'shopify' || item.listingMethod === 'processed_manual') return item.listingMethod;
  return null;
}

export function applySuccessfulShopifyPublishToInventory(): Pick<InventoryItem, 'status' | 'listingMethod'> {
  return { status: 'listed', listingMethod: 'shopify' };
}

export function applyMarkProcessed(input: {
  employeeId: string;
  now?: string;
}): Pick<InventoryItem, 'status' | 'listingMethod' | 'processedAt' | 'processedByEmployeeId'> {
  return {
    status: 'listed',
    listingMethod: 'processed_manual',
    processedAt: input.now || new Date().toISOString(),
    processedByEmployeeId: input.employeeId,
  };
}

/** Label generate/print must never include a status change. */
export function labelGenerationStatusPatch(): Partial<InventoryItem> {
  return {};
}

export function canOpenInAutoLister(item: Pick<InventoryItem, 'status' | 'quantityOnHand' | 'listingMethod'>): boolean {
  return isNonListedInventory(item) && item.quantityOnHand > 0 && listingMethodOf(item) !== 'processed_manual';
}

export function canMarkAsProcessed(item: Pick<InventoryItem, 'status' | 'quantityOnHand' | 'listingMethod'>): boolean {
  return canOpenInAutoLister(item);
}

export function showsManualLabelAction(item: Pick<InventoryItem, 'status' | 'listingMethod'>): boolean {
  return isListedInventory(item) && listingMethodOf(item) === 'processed_manual';
}

export function showsShopifyListedActions(item: Pick<InventoryItem, 'status' | 'listingMethod'>): boolean {
  return isListedInventory(item) && listingMethodOf(item) === 'shopify';
}

export function listingMethodLabel(method: InventoryListingMethod | null | undefined): string {
  if (method === 'shopify') return 'Shopify Listed';
  if (method === 'processed_manual') return 'Processed Manually';
  return 'Listed';
}

export function resolveListingMethod(input: {
  item: Pick<InventoryItem, 'status' | 'listingMethod'>;
  shopifyListings?: Array<Pick<ShopifyListing, 'status'>>;
}): InventoryListingMethod | null {
  const stored = listingMethodOf(input.item);
  if (stored) return stored;
  return inferListingMethodFromRecords({
    inventoryStatus: input.item.status,
    shopifyListings: input.shopifyListings || [],
  });
}

export function inferListingMethodFromRecords(input: {
  inventoryStatus: InventoryStatus;
  shopifyListings: Array<Pick<ShopifyListing, 'status'>>;
}): InventoryListingMethod | null {
  if (input.inventoryStatus !== 'listed') return null;
  const hasActive = input.shopifyListings.some((row) => row.status === 'active' || row.status === 'publishing');
  if (hasActive) return 'shopify';
  if (input.shopifyListings.length === 0) return 'processed_manual';
  return null;
}
