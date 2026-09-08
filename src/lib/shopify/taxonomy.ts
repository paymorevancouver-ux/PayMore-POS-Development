import type { ShopifyTaxonomyCategory } from '@/types/shopify';
import { SHOPIFY_CATEGORY_SEARCH_HINTS } from '@/config/shopifyCategoryMappings';

export const SHOPIFY_TAXONOMY_CATEGORY_GID = /^gid:\/\/shopify\/TaxonomyCategory\/[A-Za-z0-9-]+$/;

export function isShopifyTaxonomyCategoryId(value?: string | null): boolean {
  return SHOPIFY_TAXONOMY_CATEGORY_GID.test(String(value || '').trim());
}

export function rejectFabricatedCategoryId(value?: string | null): string | null {
  const id = String(value || '').trim();
  if (!id) return 'Shopify category is required.';
  if (!isShopifyTaxonomyCategoryId(id)) return 'Shopify category must be a real TaxonomyCategory ID.';
  return null;
}

export function taxonomySearchHints(categoryKey: string): string[] {
  const raw = String(categoryKey || '').trim();
  const underscored = raw.toLowerCase().replace(/[\s-]+/g, '_');
  const hyphenated = raw.toLowerCase().replace(/[\s_]+/g, '-');
  return SHOPIFY_CATEGORY_SEARCH_HINTS[raw]
    || SHOPIFY_CATEGORY_SEARCH_HINTS[underscored]
    || SHOPIFY_CATEGORY_SEARCH_HINTS[hyphenated]
    || [];
}

export function productSetCategoryAndType(listing: {
  shopifyCategoryId?: string | null;
  shopifyProductType?: string | null;
}): { category?: string; productType: string } {
  return {
    category: isShopifyTaxonomyCategoryId(listing.shopifyCategoryId) ? String(listing.shopifyCategoryId) : undefined,
    productType: String(listing.shopifyProductType || ''),
  };
}

export function savedShopifyCategory(row: {
  id: string;
  name: string;
  fullName?: string;
}): { shopifyCategoryId: string; shopifyCategoryName: string; shopifyCategoryFullName: string } {
  if (!isShopifyTaxonomyCategoryId(row.id)) {
    throw new Error(rejectFabricatedCategoryId(row.id) || 'Shopify category must be a real TaxonomyCategory ID.');
  }
  return {
    shopifyCategoryId: row.id,
    shopifyCategoryName: row.name,
    shopifyCategoryFullName: row.fullName || row.name,
  };
}

export function pickSuggestedTaxonomyCategory(results: ShopifyTaxonomyCategory[]): ShopifyTaxonomyCategory | null {
  if (!results.length) return null;
  return results.find((row) => row.isLeaf !== false) || results[0];
}

export function taxonomyFailureMessage(error?: string | null): string {
  return error?.trim() || 'Unable to load Shopify categories.';
}

export function buildCategoryMetafields(input: {
  attributes?: Record<string, unknown>;
  taxonomyAttributes?: Array<{ handle?: string; name?: string }>;
}): Array<{ namespace: string; key: string; type: string; value: string }> {
  const attributes = input.attributes || {};
  const taxonomy = input.taxonomyAttributes || [];
  if (!taxonomy.length) return [];
  const valueFor = (path: string) => {
    const parts = path.split('.');
    let cur: unknown = attributes;
    for (const part of parts) {
      if (!cur || typeof cur !== 'object') return '';
      cur = (cur as Record<string, unknown>)[part];
    }
    return String(cur || '').trim();
  };
  const candidates: Array<{ match: RegExp; value: string }> = [
    { match: /color/i, value: valueFor('color') },
    { match: /capacity|storage/i, value: valueFor('storage.primaryCapacity') },
    { match: /size/i, value: valueFor('display.size') },
  ];
  const out: Array<{ namespace: string; key: string; type: string; value: string }> = [];
  for (const item of taxonomy) {
    const handle = String(item.handle || item.name || '').trim();
    if (!handle) continue;
    const hit = candidates.find((row) => row.match.test(handle) && row.value);
    if (!hit) continue;
    out.push({
      namespace: 'shopify',
      key: handle.slice(0, 64).replace(/\s+/g, '_').toLowerCase(),
      type: 'single_line_text_field',
      value: hit.value.slice(0, 255),
    });
  }
  return out;
}
