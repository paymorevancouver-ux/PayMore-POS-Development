import { describe, expect, it } from 'vitest';
import {
  buildCategorySetPayload,
  buildDescriptionSetPayload,
  buildProductCreatePayload,
  buildProductUpdatePayload,
  buildVariantUpdatePayload,
  existingProductRetryProductSetInput,
  graphqlInputHasNullOptionValues,
  payloadHasVariants,
  productSetCreateOmitsVariants,
  productSetUpdateOmitsVariants,
} from './productPayload';
import { chooseInitialVariant, unexpectedVariantCountMessage } from './publish';

const listing = {
  title: 'Google Pixel 7 128GB',
  description: '<div><h1>Google Pixel 7 128GB</h1></div>',
  shopifyVendor: 'Google',
  shopify_vendor: 'Google',
  shopifyProductType: 'Smartphone',
  shopify_product_type: 'Smartphone',
  tags: ['Google', 'Pixel'],
  shopifyCategoryId: 'gid://shopify/TaxonomyCategory/el-4-8-5-2',
  shopify_category_id: 'gid://shopify/TaxonomyCategory/el-4-8-5-2',
  shopifyCategoryConfirmed: true,
  price: 131,
  compare_at_price: 150,
  sku: 'BC05-000620',
  barcode: '405000006201',
};

describe('productSet payloads never send invalid variants', () => {
  it('product update payload contains no variants', () => {
    const payload = buildProductUpdatePayload(listing);
    expect(payloadHasVariants(payload)).toBe(false);
    expect(payload.variants).toBeUndefined();
    expect(payload.title).toBe('Google Pixel 7 128GB');
    expect(payload.descriptionHtml).toContain('<h1>');
    expect(payload.category).toBe('gid://shopify/TaxonomyCategory/el-4-8-5-2');
    expect(graphqlInputHasNullOptionValues(payload)).toBe(false);
  });

  it('category update productSet contains no variants', () => {
    const payload = buildCategorySetPayload('gid://shopify/TaxonomyCategory/el-4-8-5-2');
    expect(payload).toEqual({ category: 'gid://shopify/TaxonomyCategory/el-4-8-5-2' });
    expect(payloadHasVariants(payload)).toBe(false);
    expect(graphqlInputHasNullOptionValues(payload)).toBe(false);
  });

  it('description update productSet contains no variants', () => {
    const payload = buildDescriptionSetPayload('<div><h1>Google Pixel 7 128GB</h1></div>');
    expect(payload).toEqual({ descriptionHtml: '<div><h1>Google Pixel 7 128GB</h1></div>' });
    expect(payloadHasVariants(payload)).toBe(false);
    expect(graphqlInputHasNullOptionValues(payload)).toBe(false);
  });

  it('existing product retry does not send variants through productSet', () => {
    const retry = existingProductRetryProductSetInput(listing, 'gid://shopify/Product/1');
    expect(productSetUpdateOmitsVariants(retry.identifier, retry.input)).toBe(true);
    expect(retry.input.id).toBeUndefined();
    expect(payloadHasVariants(retry.input)).toBe(false);
    expect(graphqlInputHasNullOptionValues({ identifier: retry.identifier, input: retry.input })).toBe(false);
  });

  it('initial create omits variants so Shopify keeps the Default Title variant', () => {
    const payload = buildProductCreatePayload(listing);
    expect(productSetCreateOmitsVariants(payload)).toBe(true);
    expect(payload.variants).toBeUndefined();
    expect(payload.productOptions).toBeUndefined();
    expect(payload.status).toBe('DRAFT');
    expect(graphqlInputHasNullOptionValues(payload)).toBe(false);
  });

  it('variant update uses existing Shopify variant ID and never sends optionValues null', () => {
    const payload = buildVariantUpdatePayload({
      variantId: 'gid://shopify/ProductVariant/55283200491892',
      sku: 'BC05-000620',
      barcode: '405000006201',
      price: 131,
      compareAtPrice: 150,
    });
    expect(payload.id).toBe('gid://shopify/ProductVariant/55283200491892');
    expect(payload.optionValues).toBeUndefined();
    expect((payload.inventoryItem as { sku: string }).sku).toBe('BC05-000620');
    expect(payload.barcode).toBe('405000006201');
    expect(payload.price).toBe('131.00');
    expect(graphqlInputHasNullOptionValues({
      productSet: buildProductCreatePayload(listing),
      productUpdate: buildProductUpdatePayload(listing),
      categorySet: buildCategorySetPayload(String(listing.shopifyCategoryId)),
      descriptionSet: buildDescriptionSetPayload(String(listing.description)),
      variantUpdate: payload,
    })).toBe(false);
  });

  it('rejects optionValues: null anywhere in a GraphQL payload', () => {
    expect(graphqlInputHasNullOptionValues({
      variants: [{ id: 'gid://shopify/ProductVariant/1', optionValues: null }],
    })).toBe(true);
    expect(graphqlInputHasNullOptionValues({
      variants: [{ id: 'gid://shopify/ProductVariant/1', optionValues: [{ optionName: 'Title', name: 'Default Title' }] }],
    })).toBe(false);
  });

  it('one POS item ends with one Shopify variant', () => {
    const nodes = [{ id: 'gid://shopify/ProductVariant/1', title: 'Default Title', sku: 'BC05-000620' }];
    expect(chooseInitialVariant(nodes)?.id).toBe('gid://shopify/ProductVariant/1');
    expect(unexpectedVariantCountMessage(1)).toBeNull();
    expect(unexpectedVariantCountMessage(2)).toMatch(/VARIANT_VERIFY/);
  });
});
