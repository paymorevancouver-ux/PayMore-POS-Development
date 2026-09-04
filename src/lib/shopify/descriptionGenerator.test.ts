import { describe, expect, it } from 'vitest';
import { descriptionContainsInternalLeak, generateShopifyDescription } from './descriptionGenerator';
import { assertNoInternalLeak } from './visibility';

describe('Shopify description generator', () => {
  it('uses the public section structure and omits internal values', () => {
    const description = generateShopifyDescription({
      categoryKey: 'apple-iphone',
      brand: 'Apple',
      model: 'iPhone 15 Pro',
      condition: 'excellent',
      attributes: {
        color: 'Natural Titanium',
        storage: { primaryCapacity: '256GB' },
        unlockedStatus: 'Unlocked',
        imei1: '356789012345678',
        serialNumber: 'SERIAL-1',
        cosmeticCondition: 'Very Good',
      },
      accessories: [{ id: 'usb-cable', label: 'USB Cable', included: true }],
      testingResults: { camera: 'pass', wifi: 'pass', charging: 'not-tested' },
    });

    expect(description).toContain('Product Overview');
    expect(description).toContain('Condition');
    expect(description).toContain('Specifications');
    expect(description).toContain('Functional Testing');
    expect(description).toContain('Included Accessories');
    expect(description).toContain('256GB');
    expect(description).toContain('USB Cable');
    expect(description).toContain('Camera: Pass');
    expect(description).not.toContain('356789012345678');
    expect(description).not.toContain('SERIAL-1');
    expect(descriptionContainsInternalLeak(description)).toBe(false);
    expect(assertNoInternalLeak(description)).toEqual([]);
  });

  it('does not include staff notes or cost', () => {
    const description = generateShopifyDescription({
      categoryKey: 'windows-laptop',
      brand: 'ASUS',
      model: 'G14',
      publicNotes: '',
      attributes: { ram: { total: '16GB' } },
    });
    expect(description.toLowerCase()).not.toContain('staff');
    expect(description.toLowerCase()).not.toContain('cost');
  });
});
