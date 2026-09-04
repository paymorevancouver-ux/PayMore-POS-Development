import { MAX_SHOPIFY_SELECTION } from '@/lib/shopify/constants';

export interface SelectionResult {
  selectedIds: string[];
  error?: string;
}

export function toggleInventorySelection(
  selectedIds: string[],
  inventoryItemId: string,
  max = MAX_SHOPIFY_SELECTION,
): SelectionResult {
  if (selectedIds.includes(inventoryItemId)) {
    return { selectedIds: selectedIds.filter((id) => id !== inventoryItemId) };
  }
  if (selectedIds.length >= max) {
    return {
      selectedIds,
      error: `You can select up to ${max} inventory items.`,
    };
  }
  return { selectedIds: [...selectedIds, inventoryItemId] };
}

export function selectionCountLabel(count: number, max = MAX_SHOPIFY_SELECTION): string {
  return `${count} / ${max} selected`;
}
