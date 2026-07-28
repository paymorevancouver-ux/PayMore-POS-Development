import { round2 } from '@/lib/taxCalc';
import type { Customer, InventoryItem, Return, SaleItem, SaleTransaction } from '@/types';

export interface ReturnSearchResult {
  saleId: string;
  saleItemId: string;
  saleCode: string;
  productName: string;
  brand: string;
  model: string;
  category: string;
  quantitySold: number;
  quantityReturned: number;
  quantityEligible: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  saleDate: string;
  deviceCode: string;
  serialImei: string;
  searchText: string;
}

export interface ReturnSearchInput {
  sales: SaleTransaction[];
  saleItems: SaleItem[];
  inventory: InventoryItem[];
  customers: Customer[];
  returns: Return[];
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

function includesQuery(haystack: string, query: string): boolean {
  return normalize(haystack).includes(query);
}

/** Infer returned units from completed return refund amounts (no return_quantity column in DB). */
export function inferReturnedQuantity(saleItem: SaleItem, completedReturns: Return[]): number {
  const perUnitTotal = saleItem.quantity > 0 ? saleItem.lineTotal / saleItem.quantity : saleItem.lineTotal;
  if (perUnitTotal <= 0) return 0;

  let returned = 0;
  for (const ret of completedReturns) {
    if (ret.sourceItemId !== saleItem.id || ret.status !== 'completed') continue;

    if (ret.returnAmount >= saleItem.lineTotal - 0.01) {
      returned += saleItem.quantity;
      continue;
    }

    const inferred = Math.round(ret.returnAmount / perUnitTotal);
    returned += Math.max(1, inferred);
  }

  return Math.min(saleItem.quantity, returned);
}

export function calculateProportionalRefund(saleItem: SaleItem, returnQuantity: number): number {
  if (returnQuantity <= 0) return 0;
  if (returnQuantity >= saleItem.quantity) return saleItem.lineTotal;
  return round2((saleItem.lineTotal / saleItem.quantity) * returnQuantity);
}

export function getReturnEligibility(
  saleItem: SaleItem,
  returns: Return[],
): { quantityReturned: number; quantityEligible: number } {
  const quantityReturned = inferReturnedQuantity(saleItem, returns);
  const quantityEligible = Math.max(0, saleItem.quantity - quantityReturned);
  return { quantityReturned, quantityEligible };
}

function buildSearchBlob(
  sale: SaleTransaction,
  saleItem: SaleItem,
  inventory?: InventoryItem,
  customer?: Customer,
): string {
  const parts = [
    sale.saleCode,
    sale.id,
    saleItem.brand,
    saleItem.model,
    `${saleItem.brand} ${saleItem.model}`,
    saleItem.category,
    saleItem.serialImei,
    inventory?.deviceCode,
    customer?.firstName,
    customer?.lastName,
    `${customer?.firstName ?? ''} ${customer?.lastName ?? ''}`,
    customer?.phone,
    customer?.email,
    customer?.customerCode,
    sale.completedAt,
    sale.createdAt,
  ];
  return normalize(parts.filter(Boolean).join(' '));
}

export function searchReturnableSales(
  query: string,
  input: ReturnSearchInput,
  limit = 50,
): ReturnSearchResult[] {
  const q = normalize(query);
  if (!q) return [];

  const inventoryById = new Map(input.inventory.map((i) => [i.id, i]));
  const customerById = new Map(input.customers.map((c) => [c.id, c]));
  const completedSales = input.sales.filter((s) => s.status === 'completed' || s.status === 'partially-returned');

  const results: ReturnSearchResult[] = [];

  for (const sale of completedSales) {
    const customer = sale.customerId ? customerById.get(sale.customerId) : undefined;
    const items = input.saleItems.filter((i) => i.salesTransactionId === sale.id);

    for (const saleItem of items) {
      const inventory = saleItem.inventoryItemId
        ? inventoryById.get(saleItem.inventoryItemId)
        : undefined;
      const searchText = buildSearchBlob(sale, saleItem, inventory, customer);

      if (!searchText.includes(q)) continue;

      const { quantityReturned, quantityEligible } = getReturnEligibility(saleItem, input.returns);
      if (quantityEligible <= 0) continue;

      results.push({
        saleId: sale.id,
        saleItemId: saleItem.id,
        saleCode: sale.saleCode,
        productName: `${saleItem.brand} ${saleItem.model}`.trim(),
        brand: saleItem.brand,
        model: saleItem.model,
        category: saleItem.category,
        quantitySold: saleItem.quantity,
        quantityReturned,
        quantityEligible,
        customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'Walk-in',
        customerPhone: customer?.phone ?? '',
        customerEmail: customer?.email ?? '',
        saleDate: sale.completedAt || sale.createdAt,
        deviceCode: inventory?.deviceCode ?? '',
        serialImei: saleItem.serialImei || inventory?.serialImei || '',
        searchText,
      });
    }
  }

  return results
    .sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime())
    .slice(0, limit);
}

/** Split text around case-insensitive matches for highlight rendering. */
export function splitHighlightParts(text: string, query: string): Array<{ text: string; match: boolean }> {
  if (!text || !query.trim()) return [{ text, match: false }];

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const parts: Array<{ text: string; match: boolean }> = [];
  let start = 0;
  let index = lowerText.indexOf(lowerQuery);

  while (index !== -1) {
    if (index > start) parts.push({ text: text.slice(start, index), match: false });
    parts.push({ text: text.slice(index, index + lowerQuery.length), match: true });
    start = index + lowerQuery.length;
    index = lowerText.indexOf(lowerQuery, start);
  }

  if (start < text.length) parts.push({ text: text.slice(start), match: false });
  return parts.length ? parts : [{ text, match: false }];
}
