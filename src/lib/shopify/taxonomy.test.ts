import { describe, expect, it } from 'vitest';
import { SHOPIFY_CATEGORY_SEARCH_HINTS } from '@/config/shopifyCategoryMappings';
import {
  isShopifyTaxonomyCategoryId,
  productSetCategoryAndType,
  rejectFabricatedCategoryId,
  savedShopifyCategory,
  taxonomyFailureMessage,
  taxonomySearchHints,
  buildCategoryMetafields,
} from './taxonomy';

describe('Shopify Standard Product Taxonomy', () => {
  it('accepts real TaxonomyCategory GIDs and rejects fabricated IDs', () => {
    expect(isShopifyTaxonomyCategoryId('gid://shopify/TaxonomyCategory/aa-1')).toBe(true);
    expect(rejectFabricatedCategoryId('Hard Drives in Storage Devices')).toBe(
      'Shopify category must be a real TaxonomyCategory ID.',
    );
    expect(rejectFabricatedCategoryId('gid://shopify/Product/123')).not.toBeNull();
    expect(() => savedShopifyCategory({
      id: 'laptop-computers',
      name: 'Laptops',
      fullName: 'Electronics > Computers > Laptops',
    })).toThrow(/TaxonomyCategory/);
  });

  it('saves category id, name, and fullName from API values', () => {
    expect(savedShopifyCategory({
      id: 'gid://shopify/TaxonomyCategory/el-4-7',
      name: 'Laptops',
      fullName: 'Electronics > Computers > Laptops',
    })).toEqual({
      shopifyCategoryId: 'gid://shopify/TaxonomyCategory/el-4-7',
      shopifyCategoryName: 'Laptops',
      shopifyCategoryFullName: 'Electronics > Computers > Laptops',
    });
  });

  it('keeps Product Category and Product Type separate in the publish payload', () => {
    const payload = productSetCategoryAndType({
      shopifyCategoryId: 'gid://shopify/TaxonomyCategory/aa-1',
      shopifyProductType: 'Laptop',
    });
    expect(payload.category).toBe('gid://shopify/TaxonomyCategory/aa-1');
    expect(payload.productType).toBe('Laptop');
    expect(payload.category).not.toBe(payload.productType);
  });

  it('omits fabricated category IDs from the publish payload', () => {
    expect(productSetCategoryAndType({
      shopifyCategoryId: 'Hard Drives in Storage Devices',
      shopifyProductType: 'Storage',
    }).category).toBeUndefined();
  });

  it('maps internal categories to search hints, not fake Shopify IDs', () => {
    const hints = taxonomySearchHints('windows-laptop');
    expect(hints).toEqual(['laptop computer', 'notebook computer']);
    expect(taxonomySearchHints('apple-iphone')).toEqual(['mobile phone', 'smartphone']);
    expect(taxonomySearchHints('internal_hdd')).toEqual(['hard drive', 'internal hard drive']);
    for (const terms of Object.values(SHOPIFY_CATEGORY_SEARCH_HINTS)) {
      expect(terms.every((term) => !term.includes('gid://shopify/'))).toBe(true);
    }
  });

  it('shows a taxonomy API failure without inventing a category', () => {
    expect(taxonomyFailureMessage()).toBe('Unable to load Shopify categories.');
    expect(taxonomyFailureMessage('Unable to load Shopify categories.')).toBe('Unable to load Shopify categories.');
  });

  it('maps Shopify category metafields separately from paymore custom metafields', () => {
    const fields = buildCategoryMetafields({
      attributes: { color: 'Black', storage: { primaryCapacity: '256GB' } },
      taxonomyAttributes: [{ handle: 'color' }, { handle: 'storage_capacity' }],
    });
    expect(fields.every((field) => field.namespace === 'shopify')).toBe(true);
    expect(fields.some((field) => field.key === 'color' && field.value === 'Black')).toBe(true);
    expect(fields.every((field) => field.namespace !== 'paymore')).toBe(true);
  });
});
