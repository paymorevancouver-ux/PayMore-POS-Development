import { describe, expect, it } from 'vitest';
import { formatMargin, listingProfit } from './pricing';

describe('listing profit and margin', () => {
  it('uses POS cost against selling price', () => {
    expect(listingProfit(199.99, 50)).toEqual({
      profit: 149.99,
      margin: ((199.99 - 50) / 199.99) * 100,
    });
  });

  it('handles zero price without dividing by zero', () => {
    expect(listingProfit(0, 50)).toEqual({ profit: -50, margin: null });
    expect(formatMargin(null)).toBe('—');
  });
});
