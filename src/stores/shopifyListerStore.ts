import { create } from 'zustand';
import { db } from '@/lib/database';
import { generateId } from '@/lib/taxCalc';
import { HOLDING_PERIOD_SETTING_KEY, parseHoldingPeriodDays } from '@/lib/holdingPeriod';
import { checkDuplicateShopifyListing } from '@/lib/shopify/duplicates';
import { applyDraftUpdates, buildDraftListing } from '@/lib/shopify/prefill';
import { applyPublishFailure, applyPublishStarted, applyPublishSuccess, canPublishListing } from '@/lib/shopify/publish';
import { validateReadyListing } from '@/lib/shopify/validation';
import { shopifyCatalogService, type ShopifyConnectionResult, type ShopifyPublishResult } from '@/services/shopify';
import type { InventoryItem, PurchaseItem } from '@/types';
import type { ShopifyListing } from '@/types/shopify';

interface ShopifyListerState {
  listings: ShopifyListing[];
  holdingPeriodDays: number;
  isLoading: boolean;
  loadError: string | null;
  lastSavedAt: string | null;
  publishingListingId: string | null;
  connection: ShopifyConnectionResult | null;
  load: (storeId: string) => Promise<void>;
  createDrafts: (args: {
    storeId: string;
    employeeId: string | null;
    items: InventoryItem[];
    purchaseItems: PurchaseItem[];
  }) => Promise<{ created: ShopifyListing[]; continued: ShopifyListing[]; blocked: Array<{ item: InventoryItem; message: string }> }>;
  saveListing: (listing: ShopifyListing, updates: Partial<ShopifyListing>) => Promise<ShopifyListing | null>;
  markReady: (listing: ShopifyListing, categoryLabel?: string) => Promise<{ listing?: ShopifyListing; issues: ReturnType<typeof validateReadyListing>['issues'] }>;
  publishListing: (args: {
    listing: ShopifyListing;
    storeId: string;
    employeeId: string;
    employeeName: string;
  }) => Promise<ShopifyPublishResult>;
  testConnection: (args?: { storeId?: string; employeeId?: string; employeeName?: string }) => Promise<ShopifyConnectionResult>;
}

export const useShopifyListerStore = create<ShopifyListerState>((set, get) => ({
  listings: [],
  holdingPeriodDays: 0,
  isLoading: false,
  loadError: null,
  lastSavedAt: null,
  publishingListingId: null,
  connection: null,

  load: async (storeId) => {
    set({ isLoading: true, loadError: null });
    try {
      const [listings, holdingRaw] = await Promise.all([
        db.getShopifyListings(storeId),
        db.getSetting(storeId, HOLDING_PERIOD_SETTING_KEY),
      ]);
      set({
        listings,
        holdingPeriodDays: parseHoldingPeriodDays(holdingRaw),
        isLoading: false,
        loadError: null,
      });
    } catch (err) {
      console.error('[Shopify] load error:', err);
      set({
        isLoading: false,
        loadError: 'Unable to load Shopify listings. Run the Phase 1 SQL in Supabase if the table is missing.',
      });
    }
  },

  createDrafts: async ({ storeId, employeeId, items, purchaseItems }) => {
    const created: ShopifyListing[] = [];
    const continued: ShopifyListing[] = [];
    const blocked: Array<{ item: InventoryItem; message: string }> = [];
    const current = get().listings;

    for (const item of items) {
      const check = checkDuplicateShopifyListing(current.concat(created, continued), item.id);
      if (check.action === 'already-listed') {
        blocked.push({ item, message: check.message || 'Already listed on Shopify' });
        continue;
      }
      if (check.action === 'continue-draft' && check.listing) {
        continued.push(check.listing);
        continue;
      }
      const purchaseItem = purchaseItems.find((p) => p.id === item.sourcePurchaseItemId);
      const listing = buildDraftListing({
        id: generateId('SFL'),
        storeId,
        employeeId,
        inventory: item,
        purchaseItem,
      });
      const ok = await db.insertShopifyListing(listing);
      if (ok) {
        created.push(listing);
      } else {
        blocked.push({ item, message: 'Could not save draft. Confirm pos_shopify_listings exists in Supabase.' });
      }
    }

    if (created.length) {
      set((s) => ({ listings: [...created, ...s.listings] }));
    }
    return { created, continued, blocked };
  },

  saveListing: async (listing, updates) => {
    const next = applyDraftUpdates(listing, updates);
    const ok = await db.updateShopifyListing(listing.id, next);
    if (!ok) return null;
    set((s) => ({
      listings: s.listings.map((row) => (row.id === next.id ? next : row)),
      lastSavedAt: next.updatedAt,
    }));
    return next;
  },

  markReady: async (listing, categoryLabel) => {
    const result = validateReadyListing(listing, categoryLabel || listing.shopifyProductType);
    if (!result.valid) return { issues: result.issues };
    const saved = await get().saveListing(listing, { status: 'ready', lastError: null });
    return { listing: saved || undefined, issues: [] };
  },

  publishListing: async ({ listing, storeId, employeeId, employeeName }) => {
    const gate = canPublishListing(listing, {
      anyOtherPublishing: Boolean(get().publishingListingId && get().publishingListingId !== listing.id)
        || get().listings.some((row) => row.id !== listing.id && row.status === 'publishing'),
    });
    if (!gate.allowed) {
      return { success: false, status: listing.status === 'active' ? 'already_published' : 'failed', message: gate.reason || 'Cannot publish.' };
    }

    const started = applyPublishStarted(listing);
    set((s) => ({
      publishingListingId: listing.id,
      listings: s.listings.map((row) => (row.id === listing.id ? started : row)),
    }));

    const result = await shopifyCatalogService.publishListing({
      listingId: listing.id,
      storeId,
      employeeId,
      employeeName,
    });

    try {
      const listings = await db.getShopifyListings(storeId);
      set({ listings, publishingListingId: null });
      return result;
    } catch {
      if (result.success && (result.status === 'published' || result.status === 'already_published')) {
        const next = applyPublishSuccess(started, {
          shopifyProductId: result.shopifyProductId || listing.shopifyProductId || '',
          shopifyVariantId: result.shopifyVariantId || listing.shopifyVariantId || '',
          shopifyInventoryItemId: result.shopifyInventoryItemId || listing.shopifyInventoryItemId || '',
          shopifyHandle: result.shopifyHandle,
          shopifyUrl: result.shopifyAdminUrl || result.shopifyUrl,
          shopifyAdminUrl: result.shopifyAdminUrl,
          shopifyStorefrontUrl: result.shopifyStorefrontUrl,
          warning: result.warnings?.[0],
        });
        next.shopifyAdminUrl = result.shopifyAdminUrl || next.shopifyUrl;
        next.shopifyStorefrontUrl = result.shopifyStorefrontUrl || null;
        next.publishWarning = result.warnings?.[0] || null;
        set((s) => ({
          publishingListingId: null,
          listings: s.listings.map((row) => (row.id === listing.id ? next : row)),
        }));
        return { ...result, success: true };
      }

      if (result.status === 'validation_failed' || result.status === 'already_publishing') {
        set((s) => ({
          publishingListingId: null,
          listings: s.listings.map((row) => (row.id === listing.id ? listing : row)),
        }));
        return result;
      }

      const failed = applyPublishFailure(started, result.message);
      failed.shopifyProductId = result.shopifyProductId || listing.shopifyProductId;
      failed.shopifyVariantId = result.shopifyVariantId || listing.shopifyVariantId;
      failed.shopifyInventoryItemId = result.shopifyInventoryItemId || listing.shopifyInventoryItemId;
      set((s) => ({
        publishingListingId: null,
        listings: s.listings.map((row) => (row.id === listing.id ? failed : row)),
      }));
      return result;
    }
  },

  testConnection: async (args) => {
    const result = await shopifyCatalogService.testConnection(args);
    set({ connection: result });
    return result;
  },
}));
