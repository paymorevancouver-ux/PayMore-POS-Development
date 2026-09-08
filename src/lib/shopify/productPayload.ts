import { approvedDescriptionHtml, sanitizePublishTags } from '@/lib/shopify/publish';
import { isShopifyTaxonomyCategoryId } from '@/lib/shopify/taxonomy';

function listingField(listing: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = listing[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return '';
}

function listingCategoryId(listing: Record<string, unknown>): string | undefined {
  const id = listingField(listing, 'shopifyCategoryId', 'shopify_category_id');
  return isShopifyTaxonomyCategoryId(id) ? id : undefined;
}

export function buildProductCreatePayload(listing: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: listingField(listing, 'title'),
    descriptionHtml: approvedDescriptionHtml(listingField(listing, 'description')),
    vendor: listingField(listing, 'shopifyVendor', 'shopify_vendor'),
    productType: listingField(listing, 'shopifyProductType', 'shopify_product_type'),
    tags: sanitizePublishTags(Array.isArray(listing.tags) ? listing.tags as string[] : []),
    status: 'DRAFT',
  };
  const category = listingCategoryId(listing);
  if (category) payload.category = category;
  return payload;
}

export function buildProductUpdatePayload(
  listing: Record<string, unknown>,
  extras: { descriptionHtml?: string; categoryId?: string } = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: listingField(listing, 'title'),
    descriptionHtml: extras.descriptionHtml ?? approvedDescriptionHtml(listingField(listing, 'description')),
    vendor: listingField(listing, 'shopifyVendor', 'shopify_vendor'),
    productType: listingField(listing, 'shopifyProductType', 'shopify_product_type'),
    tags: sanitizePublishTags(Array.isArray(listing.tags) ? listing.tags as string[] : []),
  };
  const category = extras.categoryId || listingCategoryId(listing);
  if (category) payload.category = category;
  return payload;
}

export function buildCategorySetPayload(categoryId: string): Record<string, unknown> {
  return { category: categoryId };
}

export function buildDescriptionSetPayload(descriptionHtml: string): Record<string, unknown> {
  return { descriptionHtml };
}

export function buildVariantUpdatePayload(input: {
  variantId: string;
  sku: string;
  barcode: string;
  price: number | string;
  compareAtPrice?: number | string | null;
  taxable?: boolean;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: input.variantId,
    price: String(Number(input.price).toFixed(2)),
    barcode: input.barcode,
    inventoryItem: { sku: input.sku, tracked: true },
  };
  if (input.compareAtPrice != null && Number(input.compareAtPrice) > 0) {
    payload.compareAtPrice = String(Number(input.compareAtPrice).toFixed(2));
  }
  if (input.taxable != null) payload.taxable = input.taxable;
  return payload;
}

export function payloadHasVariants(payload: Record<string, unknown> | null | undefined): boolean {
  return Boolean(payload && Object.prototype.hasOwnProperty.call(payload, 'variants'));
}

export function graphqlInputHasNullOptionValues(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some(graphqlInputHasNullOptionValues);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(obj, 'optionValues') && obj.optionValues == null) return true;
    return Object.values(obj).some(graphqlInputHasNullOptionValues);
  }
  return false;
}

export function productSetCreateOmitsVariants(input: Record<string, unknown>): boolean {
  return !payloadHasVariants(input) && input.productOptions == null;
}

export function productSetUpdateOmitsVariants(
  identifier: { id?: string } | null | undefined,
  input: Record<string, unknown>,
): boolean {
  return Boolean(identifier?.id) && input.id == null && !payloadHasVariants(input);
}

export function existingProductRetryProductSetInput(listing: Record<string, unknown>, productId: string): {
  identifier: { id: string };
  input: Record<string, unknown>;
} {
  return {
    identifier: { id: productId },
    input: buildProductUpdatePayload(listing),
  };
}

