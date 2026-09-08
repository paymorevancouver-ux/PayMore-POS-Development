import { create } from 'zustand';
import { db } from '@/lib/database';
import { generateId } from '@/lib/taxCalc';
import { HOLDING_PERIOD_SETTING_KEY, parseHoldingPeriodDays } from '@/lib/holdingPeriod';
import { MAX_SHOPIFY_SELECTION } from '@/lib/shopify/constants';
import { checkDuplicateShopifyListing } from '@/lib/shopify/duplicates';
import { applySuccessfulShopifyPublishToInventory } from '@/lib/inventoryLifecycle';
import { evaluateShopifyEligibility } from '@/lib/shopify/eligibility';
import { syncGeneratedDescription } from '@/lib/shopify/descriptionSync';
import { getListerMeta } from '@/lib/shopify/listerMeta';
import { applyDraftUpdates, buildDraftListing } from '@/lib/shopify/prefill';
import {
  omitCategoryFields,
  pickShopifyCategoryFields,
  SHOPIFY_CATEGORY_SAVE_FAILED,
  verifyPersistedShopifyCategory,
} from '@/lib/shopify/categoryPersistence';
import { applyPublishFailure, applyPublishStarted, applyPublishSuccess, canPublishListing } from '@/lib/shopify/publish';
import {
  collectTakenBarcodes,
  generateRetailBarcode,
  isReusableRetailBarcode,
  resolveExistingBarcode,
} from '@/lib/shopify/retailBarcode';
import { validateReadyListing } from '@/lib/shopify/validation';
import { shopifyCatalogService, type ShopifyConnectionResult, type ShopifyPublishResult } from '@/services/shopify';
import { usePosStore } from '@/stores/posStore';
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
  openListingIds: string[];
  activeListingId: string | null;
  load: (storeId: string) => Promise<void>;
  createDrafts: (args: {
    storeId: string;
    employeeId: string | null;
    items: InventoryItem[];
    purchaseItems: PurchaseItem[];
  }) => Promise<{ created: ShopifyListing[]; continued: ShopifyListing[]; blocked: Array<{ item: InventoryItem; message: string }> }>;
  saveListing: (listing: ShopifyListing, updates: Partial<ShopifyListing>) => Promise<ShopifyListing | null>;
  saveShopifyCategory: (
    listing: ShopifyListing,
    fields: {
      shopifyCategoryId: string | null;
      shopifyCategoryName: string | null;
      shopifyCategoryFullName: string | null;
      shopifyCategoryConfirmed: boolean;
    },
  ) => Promise<{ listing: ShopifyListing | null; error?: string }>;
  markReady: (listing: ShopifyListing, categoryLabel?: string) => Promise<{ listing?: ShopifyListing; issues: ReturnType<typeof validateReadyListing>['issues'] }>;
  publishListing: (args: {
    listing: ShopifyListing;
    storeId: string;
    employeeId: string;
    employeeName: string;
  }) => Promise<ShopifyPublishResult>;
  generateListingBarcode: (args: {
    listing: ShopifyListing;
    inventory?: InventoryItem;
    employeeId: string;
    employeeName: string;
  }) => Promise<{ listing: ShopifyListing | null; barcode: string; error?: string }>;
  testConnection: (args?: { storeId?: string; employeeId?: string; employeeName?: string }) => Promise<ShopifyConnectionResult>;
  openTabs: (listingIds: string[], activeId?: string) => void;
  setActiveTab: (listingId: string) => void;
  closeTab: (listingId: string) => void;
}

export const useShopifyListerStore = create<ShopifyListerState>((set, get) => ({
  listings: [],
  holdingPeriodDays: 0,
  isLoading: false,
  loadError: null,
  lastSavedAt: null,
  publishingListingId: null,
  connection: null,
  openListingIds: [],
  activeListingId: null,

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
    const holdingPeriodDays = get().holdingPeriodDays;

    for (const item of items) {
      const eligibility = evaluateShopifyEligibility({ inventory: item, listings: current.concat(created, continued), holdingPeriodDays });
      if (!eligibility.eligible) {
        blocked.push({ item, message: eligibility.reason || 'Item is not eligible for Shopify.' });
        continue;
      }
      const check = checkDuplicateShopifyListing(current.concat(created, continued), item.id);
      if (check.action === 'already-listed') {
        blocked.push({ item, message: check.message || 'Already listed on Shopify' });
        continue;
      }
      if (check.action === 'continue-draft' && check.listing) {
        const listing = getListerMeta(check.listing).descriptionMode === 'manual'
          ? check.listing
          : syncGeneratedDescription(check.listing);
        continued.push(listing);
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
    const opened = [...created, ...continued].map((row) => row.id);
    if (opened.length) {
      get().openTabs(opened, opened[0]);
    }
    return { created, continued, blocked };
  },

  saveListing: async (listing, updates) => {
    const next = applyDraftUpdates(listing, omitCategoryFields(updates));
    const ok = await db.updateShopifyListing(listing.id, omitCategoryFields(next));
    if (!ok) return null;
    set((s) => {
      const existing = s.listings.find((row) => row.id === listing.id) || listing;
      const merged = { ...next, ...pickShopifyCategoryFields(existing) };
      return {
        listings: s.listings.map((row) => (row.id === merged.id ? merged : row)),
        lastSavedAt: merged.updatedAt,
      };
    });
    return get().listings.find((row) => row.id === listing.id) || { ...next, ...pickShopifyCategoryFields(listing) };
  },

  saveShopifyCategory: async (listing, fields) => {
    const result = await db.saveShopifyListingCategory(listing.id, fields);
    if (!result.listing) return { listing: null, error: result.error || SHOPIFY_CATEGORY_SAVE_FAILED };
    const persisted = pickShopifyCategoryFields(result.listing);
    if (fields.shopifyCategoryConfirmed && !verifyPersistedShopifyCategory({ id: String(fields.shopifyCategoryId || '') }, persisted)) {
      return { listing: null, error: SHOPIFY_CATEGORY_SAVE_FAILED };
    }
    if (!fields.shopifyCategoryConfirmed && persisted.shopifyCategoryConfirmed) {
      return { listing: null, error: SHOPIFY_CATEGORY_SAVE_FAILED };
    }
    set((s) => ({
      listings: s.listings.map((row) => (
        row.id === result.listing!.id
          ? { ...row, ...result.listing!, ...persisted }
          : row
      )),
      lastSavedAt: result.listing.updatedAt,
    }));
    return { listing: { ...result.listing, ...persisted } };
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

    const syncInventoryOnSuccess = () => {
      if (!result.success) return;
      usePosStore.getState().updateInventoryItem(
        listing.inventoryItemId,
        applySuccessfulShopifyPublishToInventory(),
      );
    };

    try {
      const listings = await db.getShopifyListings(storeId);
      set({ listings, publishingListingId: null });
      syncInventoryOnSuccess();
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
          barcode: result.barcode,
        });
        next.shopifyAdminUrl = result.shopifyAdminUrl || next.shopifyUrl;
        next.shopifyStorefrontUrl = result.shopifyStorefrontUrl || null;
        next.publishWarning = result.warnings?.[0] || null;
        set((s) => ({
          publishingListingId: null,
          listings: s.listings.map((row) => (row.id === listing.id ? next : row)),
        }));
        syncInventoryOnSuccess();
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

  generateListingBarcode: async ({ listing, inventory, employeeId, employeeName }) => {
    const identity = {
      deviceCode: inventory?.deviceCode || listing.sku,
      sku: listing.sku,
      serialImei: inventory?.serialImei,
    };
    if (isReusableRetailBarcode(listing.barcode, identity) || isReusableRetailBarcode(inventory?.barcode, identity)) {
      const barcode = resolveExistingBarcode({
        inventoryBarcode: inventory?.barcode,
        listingBarcode: listing.barcode,
        upcSku: inventory?.specifications?.upcSku,
        ...identity,
      });
      if (barcode && listing.barcode !== barcode) {
        const saved = await get().saveListing(listing, { barcode });
        return { listing: saved, barcode };
      }
      return { listing, barcode: listing.barcode || inventory?.barcode || '' };
    }

    const pos = usePosStore.getState();
    const taken = collectTakenBarcodes({
      inventory: pos.inventory,
      listings: get().listings,
      exceptInventoryId: listing.inventoryItemId,
    });
    let barcode = '';
    try {
      barcode = generateRetailBarcode({
        deviceCode: listing.sku || inventory?.deviceCode || listing.inventoryItemId,
        inventoryId: listing.inventoryItemId,
        taken,
      });
    } catch (err) {
      return { listing, barcode: '', error: err instanceof Error ? err.message : 'Could not generate a unique barcode.' };
    }

    pos.updateInventoryItem(listing.inventoryItemId, { barcode });
    pos.logAction(
      employeeId,
      employeeName,
      'shopify-lister',
      'BARCODE_GENERATED',
      'inventory',
      listing.inventoryItemId,
      `barcode=${barcode} device=${listing.sku || inventory?.deviceCode || ''}`,
    );
    pos.logAction(
      employeeId,
      employeeName,
      'shopify-lister',
      'BARCODE_ASSIGNED_TO_INVENTORY',
      'inventory',
      listing.inventoryItemId,
      `barcode=${barcode} inventory=${listing.inventoryItemId}`,
    );
    const saved = await get().saveListing(listing, { barcode });
    return { listing: saved, barcode };
  },

  testConnection: async (args) => {
    const result = await shopifyCatalogService.testConnection(args);
    set({ connection: result });
    return result;
  },

  openTabs: (listingIds, activeId) => {
    set((s) => {
      const merged = [...s.openListingIds];
      for (const id of listingIds) {
        if (!merged.includes(id) && merged.length < MAX_SHOPIFY_SELECTION) merged.push(id);
      }
      const nextActive = (activeId && merged.includes(activeId) && activeId)
        || (s.activeListingId && merged.includes(s.activeListingId) ? s.activeListingId : null)
        || merged[merged.length - 1]
        || null;
      return { openListingIds: merged, activeListingId: nextActive };
    });
  },

  setActiveTab: (listingId) => set({ activeListingId: listingId }),

  closeTab: (listingId) => set((s) => {
    const openListingIds = s.openListingIds.filter((id) => id !== listingId);
    const activeListingId = s.activeListingId === listingId
      ? (openListingIds[openListingIds.length - 1] || null)
      : s.activeListingId;
    return { openListingIds, activeListingId };
  }),
}));
