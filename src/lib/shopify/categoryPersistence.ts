import { isShopifyTaxonomyCategoryId, rejectFabricatedCategoryId } from '@/lib/shopify/taxonomy';
import type { ShopifyListing, ShopifyTaxonomyAttribute, ShopifyTaxonomyCategory } from '@/types/shopify';

export interface ShopifyCategoryFields {
  shopifyCategoryId: string | null;
  shopifyCategoryName: string | null;
  shopifyCategoryFullName: string | null;
  shopifyCategoryConfirmed: boolean;
}

export interface ShopifyCategoryColumns {
  shopify_category_id: string | null;
  shopify_category_name: string | null;
  shopify_category_full_name: string | null;
  shopify_category_confirmed: boolean;
}

export const SHOPIFY_CATEGORY_REQUIRED_MESSAGE = 'A real Shopify Standard Product Taxonomy category is required.';
export const SHOPIFY_CATEGORY_SAVE_FAILED = 'Could not save Shopify category.';
export const SHOPIFY_CATEGORY_SAVING = 'Saving category...';
export const SHOPIFY_CATEGORY_CONFIRMED_LABEL = 'Confirmed';
export const SHOPIFY_CATEGORY_NEEDS_CONFIRMATION = 'Needs confirmation';

export function shopifyCategoryStatusLabel(state: {
  saving?: boolean;
  error?: string | null;
  confirmed?: boolean;
  selected?: boolean;
}): string {
  if (state.saving) return SHOPIFY_CATEGORY_SAVING;
  if (state.error) return SHOPIFY_CATEGORY_SAVE_FAILED;
  if (state.confirmed) return SHOPIFY_CATEGORY_CONFIRMED_LABEL;
  if (state.selected) return SHOPIFY_CATEGORY_NEEDS_CONFIRMATION;
  return '';
}

export const SHOPIFY_CATEGORY_FIELD_KEYS = [
  'shopifyCategoryId',
  'shopifyCategoryName',
  'shopifyCategoryFullName',
  'shopifyCategoryConfirmed',
] as const;

export function omitCategoryFields(updates: Partial<ShopifyListing>): Partial<ShopifyListing> {
  const next = { ...updates };
  delete next.shopifyCategoryId;
  delete next.shopifyCategoryName;
  delete next.shopifyCategoryFullName;
  delete next.shopifyCategoryConfirmed;
  return next;
}

export function isCategoryOnlyPatch(updates: Partial<ShopifyListing>): boolean {
  const keys = Object.keys(updates).filter((key) => key !== 'updatedAt' && key !== 'id');
  if (!keys.length) return false;
  return keys.every((key) => (
    SHOPIFY_CATEGORY_FIELD_KEYS.includes(key as typeof SHOPIFY_CATEGORY_FIELD_KEYS[number])
    || key === 'shopifyTaxonomyAttributes'
    || key === 'attributes'
  ));
}

export function verifyPersistedShopifyCategory(
  expected: { id: string },
  persisted: ShopifyCategoryFields,
): boolean {
  return persisted.shopifyCategoryConfirmed === true
    && persisted.shopifyCategoryId === expected.id
    && isShopifyTaxonomyCategoryId(persisted.shopifyCategoryId);
}

export function selectedUnconfirmedCategoryPatch(row: ShopifyTaxonomyCategory): Partial<ShopifyListing> {
  const id = String(row.id || '').trim();
  if (!isShopifyTaxonomyCategoryId(id)) {
    throw new Error(rejectFabricatedCategoryId(id) || 'Shopify category must be a real TaxonomyCategory ID.');
  }
  return {
    shopifyCategoryId: id,
    shopifyCategoryName: String(row.name || '').trim() || null,
    shopifyCategoryFullName: String(row.fullName || row.name || '').trim() || null,
    shopifyCategoryConfirmed: false,
  };
}

export function confirmedShopifyCategoryPatch(
  row: ShopifyTaxonomyCategory,
  attributes?: ShopifyTaxonomyAttribute[],
): Partial<ShopifyListing> {
  const id = String(row.id || '').trim();
  if (!isShopifyTaxonomyCategoryId(id)) {
    throw new Error(rejectFabricatedCategoryId(id) || 'Shopify category must be a real TaxonomyCategory ID.');
  }
  return {
    shopifyCategoryId: id,
    shopifyCategoryName: String(row.name || '').trim() || null,
    shopifyCategoryFullName: String(row.fullName || row.name || '').trim() || null,
    shopifyCategoryConfirmed: true,
    ...(attributes ? { shopifyTaxonomyAttributes: attributes } : {}),
  };
}

export function unconfirmShopifyCategoryPatch(listing: Pick<ShopifyListing, keyof ShopifyCategoryFields>): Partial<ShopifyListing> {
  return {
    shopifyCategoryId: listing.shopifyCategoryId ?? null,
    shopifyCategoryName: listing.shopifyCategoryName ?? null,
    shopifyCategoryFullName: listing.shopifyCategoryFullName ?? null,
    shopifyCategoryConfirmed: false,
  };
}

export function clearShopifyCategoryPatch(): Partial<ShopifyListing> {
  return {
    shopifyCategoryId: null,
    shopifyCategoryName: null,
    shopifyCategoryFullName: null,
    shopifyCategoryConfirmed: false,
    shopifyTaxonomyAttributes: [],
  };
}

export function toShopifyCategoryColumns(fields: Partial<ShopifyCategoryFields>): ShopifyCategoryColumns {
  return {
    shopify_category_id: fields.shopifyCategoryId ? String(fields.shopifyCategoryId) : null,
    shopify_category_name: fields.shopifyCategoryName ? String(fields.shopifyCategoryName) : null,
    shopify_category_full_name: fields.shopifyCategoryFullName ? String(fields.shopifyCategoryFullName) : null,
    shopify_category_confirmed: fields.shopifyCategoryConfirmed === true,
  };
}

export function fromShopifyCategoryColumns(row: Record<string, unknown>): ShopifyCategoryFields {
  const id = String(row.shopify_category_id || '').trim() || null;
  return {
    shopifyCategoryId: id,
    shopifyCategoryName: String(row.shopify_category_name || '').trim() || null,
    shopifyCategoryFullName: String(row.shopify_category_full_name || '').trim() || null,
    shopifyCategoryConfirmed: row.shopify_category_confirmed === true,
  };
}

export function pickShopifyCategoryFields(listing: Partial<ShopifyCategoryFields>): ShopifyCategoryFields {
  return {
    shopifyCategoryId: listing.shopifyCategoryId ?? null,
    shopifyCategoryName: listing.shopifyCategoryName ?? null,
    shopifyCategoryFullName: listing.shopifyCategoryFullName ?? null,
    shopifyCategoryConfirmed: listing.shopifyCategoryConfirmed === true,
  };
}

export function isShopifyCategoryPersistPatch(updates: Partial<ShopifyListing>): boolean {
  return (
    updates.shopifyCategoryId !== undefined
    || updates.shopifyCategoryName !== undefined
    || updates.shopifyCategoryFullName !== undefined
    || updates.shopifyCategoryConfirmed !== undefined
  );
}

export function mergeStaleAutosaveCategory<T extends ShopifyCategoryFields>(
  incomingSave: T,
  latestLocal?: T | null,
): T {
  if (!latestLocal) return incomingSave;
  const latest = pickShopifyCategoryFields(latestLocal);
  const incoming = pickShopifyCategoryFields(incomingSave);
  if (latest.shopifyCategoryConfirmed && !incoming.shopifyCategoryConfirmed) {
    return { ...incomingSave, ...latest };
  }
  if (latest.shopifyCategoryId && !incoming.shopifyCategoryId) {
    return { ...incomingSave, ...latest };
  }
  return incomingSave;
}

export function persistedCategoryIsPublishable(listing: {
  shopifyCategoryId?: string | null;
  shopifyCategoryConfirmed?: boolean;
  shopify_category_id?: unknown;
  shopify_category_confirmed?: unknown;
}): boolean {
  const id = String(listing.shopifyCategoryId || listing.shopify_category_id || '').trim();
  const confirmed = listing.shopifyCategoryConfirmed === true || listing.shopify_category_confirmed === true;
  return isShopifyTaxonomyCategoryId(id) && confirmed;
}

export function shopifyCategoryRequiredMessage(listing: {
  shopifyCategoryId?: string | null;
  shopifyCategoryConfirmed?: boolean;
  shopify_category_id?: unknown;
  shopify_category_confirmed?: unknown;
}): string {
  const id = String(listing.shopifyCategoryId || listing.shopify_category_id || '').trim();
  const confirmed = listing.shopifyCategoryConfirmed === true || listing.shopify_category_confirmed === true;
  return `${SHOPIFY_CATEGORY_REQUIRED_MESSAGE} SHOPIFY_CATEGORY_REQUIRED: category_id_present=${Boolean(id)}, category_confirmed=${confirmed}`;
}

export function listingHasPersistedTaxonomyGid(value?: string | null): boolean {
  return isShopifyTaxonomyCategoryId(value);
}
