import { getSpecCategory } from '@/config/productSpecifications';
import { getAttributeValue, isUsablePublicValue } from '@/lib/shopify/attributes';
import { getListerMeta } from '@/lib/shopify/listerMeta';
import { persistedCategoryIsPublishable, shopifyCategoryRequiredMessage } from '@/lib/shopify/categoryPersistence';
import { rejectFabricatedCategoryId } from '@/lib/shopify/taxonomy';
import type { ShopifyListing } from '@/types/shopify';

export interface ReadyValidationIssue {
  field: string;
  message: string;
}

export interface ReadyValidationResult {
  valid: boolean;
  issues: ReadyValidationIssue[];
}

export function validateReadyListing(listing: Pick<
  ShopifyListing,
  'title' | 'price' | 'quantity' | 'shopifyProductType' | 'shopifyVendor' | 'condition' | 'attributes'
> & {
  cosmeticConditionKey?: string | null;
  functionalityConditionKey?: string | null;
  shopifyCategoryId?: string | null;
  shopifyCategoryConfirmed?: boolean;
}, categoryLabel = ''): ReadyValidationResult {
  const issues: ReadyValidationIssue[] = [];

  const meta = getListerMeta(listing as ShopifyListing);
  const cosmeticKey = listing.cosmeticConditionKey || meta.cosmeticConditionKey;
  const functionalityKey = listing.functionalityConditionKey || meta.functionalityConditionKey;

  if (!listing.title.trim()) issues.push({ field: 'title', message: 'Title is required.' });
  if (!(Number(listing.price) > 0)) issues.push({ field: 'price', message: 'Price must be greater than $0.' });
  if (!(Number(listing.quantity) >= 1)) issues.push({ field: 'quantity', message: 'Quantity must be at least 1.' });
  if (!listing.shopifyProductType.trim()) issues.push({ field: 'shopifyProductType', message: 'Category / product type is required.' });
  if (!listing.shopifyVendor.trim()) issues.push({ field: 'shopifyVendor', message: 'Vendor is required.' });
  const categoryError = rejectFabricatedCategoryId((listing as ShopifyListing).shopifyCategoryId);
  if (!persistedCategoryIsPublishable(listing as ShopifyListing) || categoryError) {
    issues.push({
      field: 'shopifyCategoryId',
      message: categoryError && String((listing as ShopifyListing).shopifyCategoryId || '').trim()
        ? categoryError
        : shopifyCategoryRequiredMessage(listing as ShopifyListing),
    });
  }
  if (!String(cosmeticKey || '').trim()) {
    issues.push({ field: 'cosmeticConditionKey', message: 'Cosmetic Condition is required.' });
  }
  if (!String(functionalityKey || '').trim()) {
    issues.push({ field: 'functionalityConditionKey', message: 'Functionality Condition is required.' });
  }

  const category = getSpecCategory(categoryLabel || listing.shopifyProductType, listing.shopifyVendor);
  for (const field of category.fields.filter((f) => f.required && f.key !== 'cosmeticCondition' && f.key !== 'functionalCondition')) {
    const value = getAttributeValue(listing.attributes || {}, field.key);
    if (!isUsablePublicValue(value) && !String(value || '').trim()) {
      issues.push({ field: field.key, message: `${field.label} is required.` });
    }
  }

  return { valid: issues.length === 0, issues };
}
