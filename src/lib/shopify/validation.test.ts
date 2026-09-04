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
      'title', 'price', 'quantity', 'shopifyProductType', 'shopifyVendor', 'condition',
    ]));
  });

  it('requires category-specific required fields', () => {
    const result = validateReadyListing({
      ...valid,
      attributes: {},
    }, 'Apple iPhone');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'cosmeticCondition')).toBe(true);
  });
});
