import { getHoldingPeriodStatus, type HoldingPeriodStatus } from '@/lib/holdingPeriod';
import {
  BLOCKING_SHOPIFY_STATUSES,
  CONTINUABLE_SHOPIFY_STATUSES,
  type ShopifyListing,
} from '@/types/shopify';
import type { InventoryItem } from '@/types';

const EXCLUDED_INVENTORY_STATUSES = new Set(['sold', 'scrapped', 'reserved', 'defective']);

export interface EligibilityContext {
  inventory: InventoryItem;
  listings: ShopifyListing[];
  holdingPeriodDays: number;
  now?: Date;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  holding: HoldingPeriodStatus;
  existingDraft?: ShopifyListing;
  activeListing?: ShopifyListing;
}

export function evaluateShopifyEligibility(ctx: EligibilityContext): EligibilityResult {
  const holding = getHoldingPeriodStatus(ctx.inventory.acquiredAt, ctx.holdingPeriodDays, ctx.now);
  const forItem = ctx.listings.filter((l) => l.inventoryItemId === ctx.inventory.id);
  const activeListing = forItem.find((l) => BLOCKING_SHOPIFY_STATUSES.includes(l.status));
  const existingDraft = forItem.find((l) => CONTINUABLE_SHOPIFY_STATUSES.includes(l.status));

  if (ctx.inventory.quantityOnHand <= 0) {
    return { eligible: false, reason: 'No quantity on hand', holding, existingDraft, activeListing };
  }
  if (EXCLUDED_INVENTORY_STATUSES.has(ctx.inventory.status)) {
    return { eligible: false, reason: `Status is ${ctx.inventory.status}`, holding, existingDraft, activeListing };
  }
  if (!holding.completed) {
    return { eligible: false, reason: holding.label, holding, existingDraft, activeListing };
  }
  if (activeListing) {
    return { eligible: false, reason: 'Already listed on Shopify', holding, existingDraft, activeListing };
  }
  return { eligible: true, holding, existingDraft, activeListing };
}

export function getEligibleInventory(
  inventory: InventoryItem[],
  listings: ShopifyListing[],
  holdingPeriodDays: number,
  now?: Date,
): InventoryItem[] {
  return inventory.filter((item) => evaluateShopifyEligibility({
    inventory: item,
    listings,
    holdingPeriodDays,
    now,
  }).eligible);
}

export function getShopifyDashboardCounts(listings: ShopifyListing[], eligibleCount: number) {
  return {
    eligible: eligibleCount,
    drafts: listings.filter((l) => l.status === 'draft').length,
    ready: listings.filter((l) => l.status === 'ready').length,
    active: listings.filter((l) => l.status === 'active').length,
    errors: listings.filter((l) => l.status === 'error').length,
  };
}
