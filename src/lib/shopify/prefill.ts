import { getSpecCategory } from '@/config/productSpecifications';
import { COMMON_ACCESSORIES } from '@/lib/shopify/constants';
import { getAttributeValue, setAttributeValue } from '@/lib/shopify/attributes';
import { generateShopifyDescription } from '@/lib/shopify/descriptionGenerator';
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
): ShopifyAccessory[] {
  const category = getSpecCategory(categoryKey, brand);
  const existing = Array.isArray(specs?.accessories) ? specs!.accessories! : [];
  const byId = new Map(existing.map((a) => [a.id, a]));
  const fromCategory = category.accessories.map((def) => {
    const prev = byId.get(def.id);
    return {
      id: def.id,
      label: def.label,
      included: Boolean(prev?.included),
      quantity: def.quantity ? (prev?.quantity || 1) : undefined,
    };
  });
  const extras = COMMON_ACCESSORIES
    .filter((acc) => !fromCategory.some((row) => row.id === acc.id))
    .map((acc) => ({ id: acc.id, label: acc.label, included: false }));
  const custom = existing
    .filter((a) => !fromCategory.some((row) => row.id === a.id) && a.included)
    .map((a) => ({ id: a.id, label: a.note || a.id, included: true, quantity: a.quantity, custom: true }));
  if (specs?.otherAccessories?.trim()) {
    custom.push({
      id: `custom-${specs.otherAccessories.trim().toLowerCase().replace(/\s+/g, '-')}`,
      label: specs.otherAccessories.trim(),
      included: true,
      custom: true,
    });
  }
  return [...fromCategory, ...extras, ...custom];
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
  const fromSpecs = String(specs?.upcSku || getAttributeValue((specs || {}) as Record<string, unknown>, 'upcSku') || '').trim();
  return fromSpecs;
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
  const accessories = prefillAccessories(category.key, input.inventory.brand, specs);
  const testingResults = prefillTesting(category.key, input.inventory.brand, specs);
  const title = input.inventory.listingTitle
    || input.purchaseItem?.listingTitle
    || generateShopifyTitle({
      categoryKey: category.key,
      brand: input.inventory.brand,
      model: input.inventory.model,
      attributes,
    });
  const description = generateShopifyDescription({
    categoryKey: category.key,
    brand: input.inventory.brand,
    model: input.inventory.model,
    condition: input.purchaseItem?.condition || '',
    attributes,
    accessories,
    testingResults,
  });

  return {
    id: input.id,
    storeId: input.storeId,
    inventoryItemId: input.inventory.id,
    status: 'draft',
    title,
    description,
    price: input.inventory.expectedSalePrice || 0,
    compareAtPrice: null,
    quantity: Math.max(1, input.inventory.quantityOnHand || 1),
    condition: input.purchaseItem?.condition || String(attributes.cosmeticCondition || ''),
    shopifyVendor: input.inventory.brand || category.defaultBrand || '',
    shopifyProductType: category.productType,
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
    attributes,
    accessories,
    testingResults,
    staffNotes: '',
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
}

export function applyDraftUpdates(
  listing: ShopifyListing,
  updates: Partial<ShopifyListing>,
  now = new Date().toISOString(),
): ShopifyListing {
  return {
    ...listing,
    ...updates,
    id: listing.id,
    storeId: listing.storeId,
    inventoryItemId: listing.inventoryItemId,
    updatedAt: now,
  };
}
