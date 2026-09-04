import { describe, expect, it } from 'vitest';
import { MAX_SHOPIFY_SELECTION } from './constants';
import { selectionCountLabel, toggleInventorySelection } from './selection';

describe('Shopify inventory selection', () => {
  it('caps selection at 10 items', () => {
    let selected: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const result = toggleInventorySelection(selected, `INV-${i}`);
      expect(result.error).toBeUndefined();
      selected = result.selectedIds;
    }
    expect(selected).toHaveLength(MAX_SHOPIFY_SELECTION);

    const blocked = toggleInventorySelection(selected, 'INV-11');
    expect(blocked.selectedIds).toHaveLength(10);
    expect(blocked.error).toBe('You can select up to 10 inventory items.');
  });

  it('allows deselecting after the cap is reached', () => {
    const selected = Array.from({ length: 10 }, (_, i) => `INV-${i + 1}`);
    const afterRemove = toggleInventorySelection(selected, 'INV-1');
    expect(afterRemove.selectedIds).toHaveLength(9);
    const afterAdd = toggleInventorySelection(afterRemove.selectedIds, 'INV-11');
    expect(afterAdd.selectedIds).toContain('INV-11');
    expect(afterAdd.error).toBeUndefined();
  });

  it('formats the selection counter', () => {
    expect(selectionCountLabel(0)).toBe('0 / 10 selected');
    expect(selectionCountLabel(3)).toBe('3 / 10 selected');
  });
});
