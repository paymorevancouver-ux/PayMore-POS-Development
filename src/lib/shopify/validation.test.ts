import { describe, expect, it } from 'vitest';
import { validateReadyListing } from './validation';

describe('Ready listing validation', () => {
  const valid = {
    title: 'Apple iPhone 15 Pro 256GB',
    price: 799,
    quantity: 1,
    shopifyProductType: 'Smartphone',
    shopifyVendor: 'Apple',
    condition: 'excellent',
    cosmeticConditionKey: 'VERY_GOOD',
    functionalityConditionKey: 'FULLY_FUNCTIONAL',
    shopifyCategoryId: 'gid://shopify/TaxonomyCategory/aa-1',
    shopifyCategoryConfirmed: true,
    attributes: { cosmeticCondition: 'Very Good' },
  };

  it('accepts a complete listing', () => {
    expect(validateReadyListing(valid, 'Apple iPhone').valid).toBe(true);
  });

  it('requires title, price, quantity, type, vendor, and condition', () => {
    const result = validateReadyListing({
      ...valid,
      title: '',
      price: 0,
      quantity: 0,
      shopifyProductType: '',
      shopifyVendor: '',
      condition: '',
    }, 'Apple iPhone');
    expect(result.valid).toBe(false);
    const fields = result.issues.map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining([
      'title', 'price', 'quantity', 'shopifyProductType', 'shopifyVendor',
    ]));
  });

  it('requires Cosmetic Condition and Functionality Condition', () => {
    const result = validateReadyListing({
      ...valid,
      cosmeticConditionKey: '',
      functionalityConditionKey: '',
    }, 'Apple iPhone');
    expect(result.issues.some((i) => i.message === 'Cosmetic Condition is required.')).toBe(true);
    expect(result.issues.some((i) => i.message === 'Functionality Condition is required.')).toBe(true);
  });

  it('does not require the old spec cosmetic chips when listing condition keys are set', () => {
    expect(validateReadyListing({
      ...valid,
      attributes: {},
    }, 'Apple iPhone').valid).toBe(true);
  });

  it('requires a confirmed real Shopify taxonomy category', () => {
    const missing = validateReadyListing({ ...valid, shopifyCategoryId: '', shopifyCategoryConfirmed: false }, 'Apple iPhone');
    expect(missing.valid).toBe(false);
    expect(missing.issues.some((issue) => issue.field === 'shopifyCategoryId')).toBe(true);
    const fabricated = validateReadyListing({
      ...valid,
      shopifyCategoryId: 'Hard Drives in Storage Devices',
      shopifyCategoryConfirmed: true,
    }, 'Apple iPhone');
    expect(fabricated.valid).toBe(false);
  });
});
