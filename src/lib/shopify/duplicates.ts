import {
  BLOCKING_SHOPIFY_STATUSES,
  CONTINUABLE_SHOPIFY_STATUSES,
  type ShopifyListing,
} from '@/types/shopify';

export type DuplicateListingAction = 'create' | 'continue-draft' | 'already-listed';

export interface DuplicateCheckResult {
  action: DuplicateListingAction;
  listing?: ShopifyListing;
  message?: string;
}

export function checkDuplicateShopifyListing(
  listings: ShopifyListing[],
  inventoryItemId: string,
): DuplicateCheckResult {
  const forItem = listings.filter((l) => l.inventoryItemId === inventoryItemId);
  const active = forItem.find((l) => BLOCKING_SHOPIFY_STATUSES.includes(l.status));
  if (active) {
    return {
      action: 'already-listed',
      listing: active,
      message: 'Already listed on Shopify',
    };
  }
  const draft = forItem
    .filter((l) => CONTINUABLE_SHOPIFY_STATUSES.includes(l.status))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  if (draft) {
    return {
      action: 'continue-draft',
      listing: draft,
      message: 'Continue Draft',
    };
  }
  return { action: 'create' };
}

export function canCreateShopifyDraft(listings: ShopifyListing[], inventoryItemId: string): boolean {
  return checkDuplicateShopifyListing(listings, inventoryItemId).action === 'create';
}
