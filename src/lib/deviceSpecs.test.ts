import { describe, expect, it } from 'vitest';
import { generateListingTitle, parseSpecifications, specDisplay } from './deviceSpecs';
import type { DeviceSpecifications } from '@/types';

describe('deviceSpecs', () => {
  it('treats missing specification data as empty and displays Not Recorded', () => {
    expect(parseSpecifications(undefined)).toEqual({});
    expect(parseSpecifications(null)).toEqual({});
    expect(specDisplay('')).toBe('Not Recorded');
    expect(specDisplay(undefined)).toBe('Not Recorded');
  });

  it('builds a Windows laptop title from structured specs', () => {
    const specifications: DeviceSpecifications = {
      categoryId: 'windows-laptop',
      modelNumber: 'GA402XV',
      cpu: { model: 'Ryzen 9 7940HS' },
      ram: { capacity: '16GB' },
      gpu: { model: 'RTX 4060' },
      storage: [{ type: 'NVMe SSD', capacity: '1TB' }],
    };
    expect(generateListingTitle({
      category: 'Windows Laptop',
      brand: 'ASUS',
      model: 'ROG Zephyrus G14',
      specifications,
    })).toBe('ASUS ROG Zephyrus G14 GA402XV – Ryzen 9 7940HS / RTX 4060 / 16GB / 1TB NVMe SSD');
  });

  it('builds an iPhone title', () => {
    const title = generateListingTitle({
      brand: 'Apple',
      model: 'iPhone 15 Pro',
      specifications: {
        categoryId: 'apple-iphone',
        color: 'Natural Titanium',
        storage: { capacity: '256GB' },
        carrierStatus: 'Unlocked',
      },
    });
    expect(title).toBe('Apple iPhone 15 Pro 256GB Natural Titanium Unlocked');
  });

  it('builds a camera title', () => {
    const title = generateListingTitle({
      brand: 'Canon',
      model: 'PowerShot SX740 HS',
      specifications: {
        categoryId: 'digital-camera',
        megapixels: '20.3',
        opticalZoom: '40x',
      },
    });
    expect(title).toContain('Canon PowerShot SX740 HS');
    expect(title).toContain('20.3MP');
    expect(title).toContain('40x Optical Zoom');
  });

  it('builds a custom PC title with multiple drives', () => {
    const title = generateListingTitle({
      brand: 'Custom',
      model: 'Gaming PC',
      specifications: {
        categoryId: 'custom-gaming-pc',
        cpu: { model: 'Ryzen 7 5800X' },
        gpu: { model: 'RTX 3070' },
        ram: { capacity: '32GB' },
        storage: [
          { type: 'NVMe SSD', capacity: '1TB' },
          { type: 'HDD', capacity: '2TB' },
        ],
      },
    });
    expect(title).toBe('Custom Gaming PC – Ryzen 7 5800X / RTX 3070 / 32GB / 1TB NVMe SSD + 2TB HDD');
  });
});
