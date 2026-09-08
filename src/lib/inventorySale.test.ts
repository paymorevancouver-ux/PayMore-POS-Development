import { describe, expect, it } from 'vitest';
import {
  applyInventorySaleDeduction,
  applyInventoryReturn,
  validateSaleQuantity,
} from './inventorySale';

describe('validateSaleQuantity', () => {
  it('blocks quantity less than 1', () => {
    expect(validateSaleQuantity(0, 3).valid).toBe(false);
  });

  it('blocks selling more than available', () => {
    const result = validateSaleQuantity(4, 3);
    expect(result.valid).toBe(false);
    expect(result.message).toBe('Only 3 units are currently available.');
  });

  it('allows valid partial sale', () => {
    expect(validateSaleQuantity(1, 3).valid).toBe(true);
  });
});

describe('applyInventoryReturn', () => {
  it('Shopify-listed restock returns to Listed', () => {
    const result = applyInventoryReturn(0, 1, 'sold', { listingMethod: 'shopify', sellable: true });
    expect(result.quantityOnHand).toBe(1);
    expect(result.status).toBe('listed');
  });

  it('processed_manual restock returns to Listed and is not Shopify', () => {
    const result = applyInventoryReturn(0, 1, 'sold', { listingMethod: 'processed_manual', sellable: true });
    expect(result.status).toBe('listed');
  });

  it('non-listed restock returns to Non-Listed (available)', () => {
    const result = applyInventoryReturn(0, 1, 'sold', { listingMethod: null, sellable: true });
    expect(result.status).toBe('available');
  });

  it('damaged return does not restore quantity', () => {
    const result = applyInventoryReturn(0, 1, 'sold', { listingMethod: 'shopify', sellable: false });
    expect(result.quantityOnHand).toBe(0);
    expect(result.status).toBe('defective');
  });
});

describe('applyInventorySaleDeduction', () => {
  const soldAt = '2026-07-28T12:00:00.000Z';

  it('quantity 3 sell 1 → quantity 2 remains listed', () => {
    const result = applyInventorySaleDeduction(3, 1, 'listed', soldAt);
    expect(result.quantityOnHand).toBe(2);
    expect(result.status).toBe('listed');
    expect(result.soldAt).toBeNull();
    expect(result.fullySold).toBe(false);
  });

  it('quantity 3 sell 2 → quantity 1 remains listed', () => {
    const result = applyInventorySaleDeduction(3, 2, 'listed', soldAt);
    expect(result.quantityOnHand).toBe(1);
    expect(result.fullySold).toBe(false);
  });

  it('quantity 3 sell 3 → quantity 0 and status Sold', () => {
    const result = applyInventorySaleDeduction(3, 3, 'listed', soldAt);
    expect(result.quantityOnHand).toBe(0);
    expect(result.status).toBe('sold');
    expect(result.soldAt).toBe(soldAt);
    expect(result.fullySold).toBe(true);
  });

  it('quantity 1 sell 1 → fully sold', () => {
    const result = applyInventorySaleDeduction(1, 1, 'listed', soldAt);
    expect(result.quantityOnHand).toBe(0);
    expect(result.fullySold).toBe(true);
  });
});
