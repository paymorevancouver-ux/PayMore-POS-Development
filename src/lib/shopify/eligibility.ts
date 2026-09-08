import { getHoldingPeriodStatus, type HoldingPeriodStatus } from '@/lib/holdingPeriod';
import {
  isNonListedInventory,
  listingMethodOf,
  OUT_OF_STOCK_LISTING_MESSAGE,
} from '@/lib/inventoryLifecycle';
import {
  BLOCKING_SHOPIFY_STATUSES,
  CONTINUABLE_SHOPIFY_STATUSES,
  type ShopifyListing,
} from '@/types/shopify';
import type { InventoryItem } from '@/types';

const EXCLUDED_INVENTORY_STATUSES = new Set(['sold', 'scrapped', 'reserved', 'defective', 'returned', 'listed']);

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

  if (ctx.inventory.quantityOnHand <= 0 || ctx.inventory.status === 'sold') {
    return { eligible: false, reason: OUT_OF_STOCK_LISTING_MESSAGE, holding, existingDraft, activeListing };
  }
  if (ctx.inventory.status === 'listed' || listingMethodOf(ctx.inventory) === 'processed_manual') {
    return { eligible: false, reason: 'Inventory is already listed', holding, existingDraft, activeListing };
  }
  if (!isNonListedInventory(ctx.inventory) || EXCLUDED_INVENTORY_STATUSES.has(ctx.inventory.status)) {
    return { eligible: false, reason: `Status is ${ctx.inventory.status}`, holding, existingDraft, activeListing };
  }
  if (!holding.completed) {
    return { eligible: false, reason: holding.label, holding, existingDraft, activeListing };
  }
  if (activeListing?.status === 'publishing') {
    return { eligible: false, reason: 'A Shopify listing is currently publishing', holding, existingDraft, activeListing };
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

/** Non-Listed row actions: both stay hidden until holding is complete. */
export function nonListedEmployeeActions(ctx: EligibilityContext): {
  openInAutoLister: boolean;
  markAsProcessed: boolean;
  holding: HoldingPeriodStatus;
  eligibility: EligibilityResult;
} {
  const eligibility = evaluateShopifyEligibility(ctx);
  const base = isNonListedInventory(ctx.inventory)
    && ctx.inventory.quantityOnHand > 0
    && listingMethodOf(ctx.inventory) !== 'processed_manual';
  if (!base || !eligibility.holding.completed || eligibility.activeListing) {
    return { openInAutoLister: false, markAsProcessed: false, holding: eligibility.holding, eligibility };
  }
  return {
    openInAutoLister: eligibility.eligible,
    markAsProcessed: true,
    holding: eligibility.holding,
    eligibility,
  };
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
