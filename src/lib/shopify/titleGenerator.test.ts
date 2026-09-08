import { describe, expect, it } from 'vitest';
import { generateShopifyTitle } from './titleGenerator';
import { assertNoInternalLeak } from './visibility';

describe('Shopify title generator', () => {
  it('builds a Windows laptop title from public specs', () => {
    const title = generateShopifyTitle({
      categoryKey: 'windows-laptop',
      brand: 'ASUS',
      model: 'G14',
      attributes: {
        brand: 'ASUS',
        series: 'ROG Zephyrus',
        model: 'G14',
        modelNumber: 'GA402XV',
        cpu: { family: 'Ryzen 9', model: 'Ryzen 9 7940HS' },
        ram: { total: '16GB' },
        storage: { primaryCapacity: '1TB' },
        gpu: { type: 'Dedicated', model: 'RTX 4060' },
        serialNumber: 'SN-SHOULD-NOT-APPEAR',
      },
    });
    expect(title).toContain('ASUS');
    expect(title).toContain('ROG Zephyrus');
    expect(title).toContain('G14');
    expect(title).toContain('GA402XV');
    expect(title).toContain('Ryzen 9');
    expect(title).toContain('16GB');
    expect(title).toContain('1TB');
    expect(title).toContain('RTX 4060');
    expect(title).toContain('Gaming Laptop');
    expect(title).not.toContain('SN-SHOULD-NOT-APPEAR');
    expect(assertNoInternalLeak(title)).toEqual([]);
  });

  it('builds an iPhone title without IMEI', () => {
    const title = generateShopifyTitle({
      categoryKey: 'apple-iphone',
      brand: 'Apple',
      model: 'iPhone 15 Pro',
      attributes: {
        model: 'iPhone 15 Pro',
        storage: { primaryCapacity: '256GB' },
        color: 'Natural Titanium',
        unlockedStatus: 'Unlocked',
        imei1: '356789012345678',
        serialNumber: 'ABCDEF123',
      },
    });
    expect(title).toBe('Apple iPhone 15 Pro 256GB Natural Titanium Unlocked');
    expect(title).not.toContain('356789012345678');
    expect(assertNoInternalLeak(title)).toEqual([]);
  });

  it('builds a mirrorless camera body title', () => {
    const title = generateShopifyTitle({
      categoryKey: 'mirrorless-camera',
      brand: 'Sony',
      model: 'Alpha A7 IV',
      attributes: {
        brand: 'Sony',
        model: 'Alpha A7 IV',
        megapixels: '33',
        sensorSize: 'Full Frame',
        cameraType: 'Mirrorless',
        lensKit: 'Body Only',
        serialNumber: 'CAM-1',
      },
    });
    expect(title).toContain('Sony Alpha A7 IV');
    expect(title).toContain('33MP');
    expect(title).toContain('Full Frame');
    expect(title).toContain('Body');
    expect(title).not.toContain('CAM-1');
  });

  it('appends extra title text', () => {
    const title = generateShopifyTitle({
      categoryKey: 'apple-iphone',
      brand: 'Apple',
      model: 'iPhone 15 Pro',
      extraTitleText: 'w/ Charger',
      attributes: { model: 'iPhone 15 Pro' },
    });
    expect(title.endsWith('w/ Charger')).toBe(true);
  });
});
