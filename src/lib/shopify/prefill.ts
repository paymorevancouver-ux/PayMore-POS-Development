import { getSpecCategory } from '@/config/productSpecifications';
import { buildIncludedItems } from '@/config/shopifyIncludedItems';
import { getAttributeValue, setAttributeValue } from '@/lib/shopify/attributes';
import { mapPosConditionToCosmetic } from '@/lib/shopify/conditionPhrases';
import { syncGeneratedDescription } from '@/lib/shopify/descriptionSync';
import { getListerMeta, withListerMeta } from '@/lib/shopify/listerMeta';
import { resolveExistingBarcode } from '@/lib/shopify/retailBarcode';
import { generateShopifyTags } from '@/lib/shopify/tagGenerator';
import { generateShopifyTitle } from '@/lib/shopify/titleGenerator';
import type { DeviceSpecifications, InventoryItem, PurchaseItem } from '@/types';
import type { ShopifyAccessory, ShopifyListing, ShopifyTestResult } from '@/types/shopify';

const SPEC_ALIASES: Array<[string, string]> = [
  ['cpu.brand', 'cpu.manufacturer'],
  ['gpu.brand', 'gpu.manufacturer'],
  ['ram.capacity', 'ram.total'],
  ['storage.capacity', 'storage.primaryCapacity'],
  ['carrierStatus', 'unlockedStatus'],
  ['unlocked', 'unlockedStatus'],
  ['macModel', 'macFamily'],
  ['releaseYear', 'year'],
  ['findMyIphone', 'findMyIphone'],
  ['serialImei', 'serialNumber'],
];

export function mergeInventorySpecs(specs?: DeviceSpecifications): Record<string, unknown> {
  const raw = { ...(specs || {}) } as Record<string, unknown>;
  let attributes = { ...raw };
  delete attributes.accessories;
  delete attributes.otherAccessories;
  delete attributes.tests;
  delete attributes.conditionDetails;
  delete attributes.categoryId;
  delete attributes.listingTitle;

  for (const [from, to] of SPEC_ALIASES) {
    const source = getAttributeValue(raw, from);
    const dest = getAttributeValue(attributes, to);
    if (source && !dest) attributes = setAttributeValue(attributes, to, source);
  }

  if (Array.isArray(raw.storage) && raw.storage.length > 0) {
    const primary = raw.storage[0] as { type?: string; capacity?: string };
    if (primary.capacity && !getAttributeValue(attributes, 'storage.primaryCapacity')) {
      attributes = setAttributeValue(attributes, 'storage.primaryCapacity', primary.capacity);
    }
    if (primary.type && !getAttributeValue(attributes, 'storage.primaryType')) {
      attributes = setAttributeValue(attributes, 'storage.primaryType', primary.type);
    }
    if (raw.storage.length > 1) {
      attributes.additionalStorage = raw.storage.slice(1);
    }
  }

  if (raw.conditionDetails && typeof raw.conditionDetails === 'object') {
    const details = raw.conditionDetails as Record<string, string>;
    if (details.overall && !attributes.cosmeticCondition) attributes.cosmeticCondition = details.overall;
    if (details.screen && !attributes.screenCondition) attributes.screenCondition = details.screen;
    if (details.backGlass && !attributes.backGlassCondition) attributes.backGlassCondition = details.backGlass;
    if (details.body && !attributes.cosmeticCondition) attributes.cosmeticCondition = details.body;
  }

  return attributes;
}

export function prefillAccessories(
  categoryKey: string,
  brand: string,
  specs?: DeviceSpecifications,
  model = '',
): ShopifyAccessory[] {
  const category = getSpecCategory(categoryKey, brand);
  const existing = Array.isArray(specs?.accessories) ? specs!.accessories!.map((item) => ({
    id: item.id,
    label: item.note || item.id,
    included: Boolean(item.included),
    quantity: item.quantity,
    custom: !['device', 'original-charger', 'original-box'].includes(item.id),
  })) : [];
  if (specs?.otherAccessories?.trim()) {
    existing.push({
      id: `custom-${specs.otherAccessories.trim().toLowerCase().replace(/\s+/g, '-')}`,
      label: specs.otherAccessories.trim(),
      included: true,
      custom: true,
    });
  }
  return buildIncludedItems({
    categoryKey: category.key,
    brand,
    model,
    specs: specs as Record<string, unknown>,
    previous: existing,
  });
}

export function prefillTesting(
  categoryKey: string,
  brand: string,
  specs?: DeviceSpecifications,
): Record<string, ShopifyTestResult> {
  const category = getSpecCategory(categoryKey, brand);
  const prev = (specs?.tests || {}) as Record<string, string>;
  const next: Record<string, ShopifyTestResult> = {};
  for (const test of category.tests) {
    const raw = String(prev[test.id] || 'not-tested').toLowerCase();
    if (raw === 'pass' || raw === 'fail' || raw === 'not-tested' || raw === 'not-applicable') {
      next[test.id] = raw;
    } else {
      next[test.id] = 'not-tested';
    }
  }
  return next;
}

export function resolveBarcode(item: InventoryItem, specs?: DeviceSpecifications): string {
  return resolveExistingBarcode({
    inventoryBarcode: item.barcode,
    upcSku: String(specs?.upcSku || getAttributeValue((specs || {}) as Record<string, unknown>, 'upcSku') || ''),
    deviceCode: item.deviceCode,
    sku: item.deviceCode,
    serialImei: item.serialImei,
  });
}

export function buildDraftListing(input: {
  id: string;
  storeId: string;
  employeeId: string | null;
  inventory: InventoryItem;
  purchaseItem?: PurchaseItem;
  now?: string;
}): ShopifyListing {
  const now = input.now || new Date().toISOString();
  const category = getSpecCategory(input.inventory.category, input.inventory.brand);
  const specs = input.inventory.specifications || input.purchaseItem?.specifications;
  const attributes = {
    ...mergeInventorySpecs(specs),
    brand: input.inventory.brand,
    model: input.inventory.model,
    serialNumber: getAttributeValue((specs || {}) as Record<string, unknown>, 'serialNumber') || input.inventory.serialImei,
    imei1: getAttributeValue((specs || {}) as Record<string, unknown>, 'imei1') || input.inventory.serialImei,
  };
  const accessories = prefillAccessories(category.key, input.inventory.brand, specs, input.inventory.model);
  const testingResults = prefillTesting(category.key, input.inventory.brand, specs);
  const title = input.inventory.listingTitle
    || input.purchaseItem?.listingTitle
    || generateShopifyTitle({
      categoryKey: category.key,
      brand: input.inventory.brand,
      model: input.inventory.model,
      attributes,
    });
  const cosmeticConditionKey = mapPosConditionToCosmetic(input.purchaseItem?.condition || String(attributes.cosmeticCondition || ''));
  const listing: ShopifyListing = {
    id: input.id,
    storeId: input.storeId,
    inventoryItemId: input.inventory.id,
    status: 'draft',
    title,
    description: '',
    price: input.inventory.expectedSalePrice || 0,
    compareAtPrice: null,
    quantity: Math.max(1, input.inventory.quantityOnHand || 1),
    condition: input.purchaseItem?.condition || String(attributes.cosmeticCondition || cosmeticConditionKey || ''),
    shopifyVendor: input.inventory.brand || category.defaultBrand || '',
    shopifyProductType: category.productType,
    shopifyCategoryId: null,
    shopifyCategoryName: null,
    shopifyCategoryFullName: null,
    shopifyCategoryConfirmed: false,
    sku: input.inventory.deviceCode,
    barcode: resolveBarcode(input.inventory, specs),
    tags: generateShopifyTags({
      categoryKey: category.key,
      brand: input.inventory.brand,
      model: input.inventory.model,
      condition: String(input.purchaseItem?.condition || attributes.cosmeticCondition || ''),
      attributes,
    }),
    photos: [...(input.purchaseItem?.photos || [])],
    attributes: { ...attributes, categoryId: category.key },
    accessories,
    testingResults,
    staffNotes: '',
    extraTitleText: '',
    cosmeticConditionKey,
    cosmeticConditionNotes: '',
    functionalityConditionKey: '',
    functionalityNotes: '',
    descriptionMode: 'generated',
    includeNotListedWarning: true,
    originCountry: '',
    publicNotes: '',
    titleMode: input.inventory.listingTitle ? 'manual' : 'generated',
    shopifyProductId: null,
    shopifyVariantId: null,
    shopifyInventoryItemId: null,
    shopifyHandle: null,
    shopifyUrl: null,
    lastError: null,
    createdByEmployeeId: input.employeeId,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    lastSyncedAt: null,
    endedAt: null,
  };
  return syncGeneratedDescription(withListerMeta(listing, {
    cosmeticConditionKey,
    descriptionMode: 'generated',
    includeNotListedWarning: true,
    titleMode: listing.titleMode || 'generated',
  }));
}

export function applyDraftUpdates(
  listing: ShopifyListing,
  updates: Partial<ShopifyListing>,
  now = new Date().toISOString(),
): ShopifyListing {
  const next: ShopifyListing = {
    ...listing,
    ...updates,
    id: listing.id,
    storeId: listing.storeId,
    inventoryItemId: listing.inventoryItemId,
    updatedAt: now,
  };
  const metaKeys = [
    'extraTitleText',
    'cosmeticConditionKey',
    'cosmeticConditionNotes',
    'functionalityConditionKey',
    'functionalityNotes',
    'descriptionMode',
    'includeNotListedWarning',
    'originCountry',
    'publicNotes',
    'titleMode',
  ] as const;
  const metaPatch: Record<string, unknown> = {};
  for (const key of metaKeys) {
    if (updates[key] !== undefined) metaPatch[key] = updates[key];
  }
  const withMeta = Object.keys(metaPatch).length
    ? withListerMeta(next, metaPatch as Partial<import('./listerMeta').ShopifyListerMeta>)
    : next;
  const mode = withMeta.descriptionMode || getListerMeta(withMeta).descriptionMode;
  if (mode === 'manual') return withMeta;
  return syncGeneratedDescription(withMeta);
}
