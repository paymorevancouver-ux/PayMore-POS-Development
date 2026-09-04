import { getSpecCategory } from '@/config/productSpecifications';
import { getAttributeValue, isUsablePublicValue } from '@/lib/shopify/attributes';
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
>, categoryLabel = ''): ReadyValidationResult {
  const issues: ReadyValidationIssue[] = [];

  if (!listing.title.trim()) issues.push({ field: 'title', message: 'Title is required.' });
  if (!(Number(listing.price) > 0)) issues.push({ field: 'price', message: 'Price must be greater than 0.' });
  if (!(Number(listing.quantity) >= 1)) issues.push({ field: 'quantity', message: 'Quantity must be at least 1.' });
  if (!listing.shopifyProductType.trim()) issues.push({ field: 'shopifyProductType', message: 'Category / product type is required.' });
  if (!listing.shopifyVendor.trim()) issues.push({ field: 'shopifyVendor', message: 'Vendor is required.' });
  if (!String(listing.condition || '').trim()) issues.push({ field: 'condition', message: 'Condition is required.' });

  const category = getSpecCategory(categoryLabel || listing.shopifyProductType, listing.shopifyVendor);
  for (const field of category.fields.filter((f) => f.required)) {
    const value = getAttributeValue(listing.attributes || {}, field.key);
    if (!isUsablePublicValue(value) && !String(value || '').trim()) {
      issues.push({ field: field.key, message: `${field.label} is required.` });
    }
  }

  return { valid: issues.length === 0, issues };
}
