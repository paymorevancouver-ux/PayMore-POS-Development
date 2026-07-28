import { INVENTORY_STATUSES } from '@/constants/config';
import type { InventoryItem, InventoryStatus } from '@/types';

export type InventoryStatusFilter =
  | 'all'
  | 'available'
  | 'listed'
  | 'sold'
  | 'returned'
  | 'scrapped';

export type InventorySortColumn =
  | 'product'
  | 'category'
  | 'cost'
  | 'quantity'
  | 'salePrice'
  | 'status'
  | 'received';

export type InventorySortDirection = 'asc' | 'desc';

const STATUS_SEARCH_ALIASES: Record<InventoryStatus, string[]> = {
  available: ['non-listed', 'non listed', 'not listed'],
  listed: ['live', 'available', 'listed'],
  sold: ['sold'],
  returned: ['returned'],
  scrapped: ['scrapped', 'scrap'],
  reserved: ['reserved'],
  defective: ['defective'],
};

/** User-facing lifecycle label for All Inventory status column. */
export function getInventoryLifecycleLabel(status: InventoryStatus): string {
  switch (status) {
    case 'available':
      return 'Non-Listed';
    case 'listed':
      return 'Live';
    case 'sold':
      return 'Sold';
    case 'returned':
      return 'Returned';
    case 'scrapped':
      return 'Scrapped';
    case 'reserved':
      return 'Reserved';
    case 'defective':
      return 'Defective';
    default:
      return status;
  }
}

export function buildInventorySearchText(
  item: InventoryItem,
  extras?: { saleCode?: string; saleId?: string; customerName?: string },
): string {
  const cfg = INVENTORY_STATUSES.find((s) => s.value === item.status);
  const parts = [
    item.brand,
    item.model,
    `${item.brand} ${item.model}`,
    item.deviceCode,
    item.serialImei,
    item.category,
    item.storageLocation ?? '',
    item.storageRack ?? '',
    item.storageRow ?? '',
    item.notes,
    item.status,
    cfg?.label ?? '',
    getInventoryLifecycleLabel(item.status),
    ...(STATUS_SEARCH_ALIASES[item.status] ?? []),
    item.labelGenerated ? 'label generated' : 'label pending',
    extras?.saleCode ?? '',
    extras?.saleId ?? '',
    extras?.customerName ?? '',
  ];

  return parts.join(' ').toLowerCase();
}

export function matchesInventorySearch(
  item: InventoryItem,
  query: string,
  extras?: { saleCode?: string; saleId?: string; customerName?: string },
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return buildInventorySearchText(item, extras).includes(q);
}

export function filterInventoryByStatus(
  item: InventoryItem,
  statusFilter: InventoryStatusFilter,
): boolean {
  if (statusFilter === 'all') return true;
  return item.status === statusFilter;
}

export function sortInventoryItems(
  items: InventoryItem[],
  column: InventorySortColumn,
  direction: InventorySortDirection,
  soldPriceByItemId?: Map<string, number>,
): InventoryItem[] {
  const sorted = [...items];
  const factor = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (column) {
      case 'product':
        cmp = `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
        break;
      case 'category':
        cmp = a.category.localeCompare(b.category);
        break;
      case 'cost':
        cmp = a.costPerUnit - b.costPerUnit;
        break;
      case 'quantity':
        cmp = a.quantityOnHand - b.quantityOnHand;
        break;
      case 'salePrice': {
        const aPrice = soldPriceByItemId?.get(a.id) ?? a.expectedSalePrice;
        const bPrice = soldPriceByItemId?.get(b.id) ?? b.expectedSalePrice;
        cmp = aPrice - bPrice;
        break;
      }
      case 'status':
        cmp = getInventoryLifecycleLabel(a.status).localeCompare(getInventoryLifecycleLabel(b.status));
        break;
      case 'received': {
        const aDate = a.status === 'sold' && a.soldAt ? a.soldAt : a.acquiredAt;
        const bDate = b.status === 'sold' && b.soldAt ? b.soldAt : b.acquiredAt;
        cmp = new Date(aDate).getTime() - new Date(bDate).getTime();
        break;
      }
      default:
        cmp = 0;
    }
    return cmp * factor;
  });

  return sorted;
}
