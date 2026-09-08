import { describe, expect, it } from 'vitest';
import {
  buildIncludedItems,
  includedItemDefinitions,
  mergeIncludedItemsForCategoryChange,
  resolveIncludedItemGroup,
} from '@/config/shopifyIncludedItems';

describe('Category-specific What\'s Included', () => {
  it('uses laptop accessories and omits console-only items', () => {
    const labels = includedItemDefinitions('windows-laptop').map((item) => item.label);
    expect(labels).toContain('Laptop');
    expect(labels).toContain('Original Charger');
    expect(labels).not.toContain('Controller');
    expect(labels).not.toContain('Remote');
    expect(labels).not.toContain('HDMI Cable');
    expect(labels).not.toContain('DualSense / DualShock Controller');
  });

  it('uses iPhone accessories and omits camera-only items', () => {
    const labels = includedItemDefinitions('apple-iphone', 'Apple', 'iPhone 15 Pro').map((item) => item.label);
    expect(labels).toContain('Apple iPhone');
    expect(labels).toContain('SIM Tool');
    expect(labels).not.toContain('Camera Body');
    expect(labels).not.toContain('Lens');
    expect(labels).not.toContain('Body Cap');
    expect(labels).not.toContain('Controller');
    expect(labels).not.toContain('Dock');
    expect(labels).not.toContain('HDMI Cable');
  });

  it('selects the physical device by default and does not assume Original Box', () => {
    const items = buildIncludedItems({ categoryKey: 'windows-laptop' });
    expect(items.find((item) => item.id === 'device')?.included).toBe(true);
    expect(items.find((item) => item.id === 'original-box')?.included).toBe(false);
  });

  it('pre-checks charger only when intake confirms it', () => {
    const without = buildIncludedItems({ categoryKey: 'apple-iphone' });
    expect(without.find((item) => item.id === 'original-charger')?.included).toBe(false);
    const withCharger = buildIncludedItems({
      categoryKey: 'apple-iphone',
      specs: { chargerIncluded: 'yes' },
    });
    expect(withCharger.find((item) => item.id === 'original-charger')?.included).toBe(true);
  });

  it('keeps custom items and flags leftover predefined items when category changes', () => {
    const laptop = buildIncludedItems({
      categoryKey: 'windows-laptop',
      previous: [{ id: 'custom-lens', label: 'Sony 24-70mm Lens', included: true, custom: true }],
    });
    laptop.find((item) => item.id === 'dock')!.included = true;
    const phone = mergeIncludedItemsForCategoryChange(laptop, 'apple-iphone', 'Apple', 'iPhone 15');
    expect(phone.some((item) => item.id === 'custom-lens' && item.custom && !item.orphan)).toBe(true);
    const dock = phone.find((item) => item.id === 'dock');
    expect(dock?.orphan).toBe(true);
    expect(dock?.included).toBe(true);
  });

  it('maps console variants from brand/model', () => {
    expect(resolveIncludedItemGroup('gaming-console', 'Nintendo', 'Switch OLED')).toBe('nintendo_switch');
    expect(resolveIncludedItemGroup('gaming-console', 'Sony', 'PlayStation 5')).toBe('playstation');
    expect(resolveIncludedItemGroup('hdd', 'Seagate', '2TB Internal HDD')).toBe('storage_drive');
  });
});
