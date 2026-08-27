import type {
  Customer,
  CustomerVisit,
  InventoryItem,
  PurchaseItem,
  PurchaseTransaction,
  Return,
  SaleItem,
  SaleTransaction,
} from '@/types';

export interface CustomerSearchInput {
  customers: Customer[];
  visits: CustomerVisit[];
  purchases: PurchaseTransaction[];
  purchaseItems: PurchaseItem[];
  inventory: InventoryItem[];
  sales: SaleTransaction[];
  saleItems: SaleItem[];
  returns: Return[];
}

export interface CustomerListStats {
  visitCount: number;
  lastVisitAt: string | null;
  devicesPurchasedFromCustomer: number;
  devicesSoldToCustomer: number;
  totalPaidToCustomer: number;
  totalCustomerSpend: number;
}

export interface CustomerListRow extends CustomerListStats {
  customer: Customer;
}

function norm(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function compactId(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[\s-]/g, '');
}

function pushPart(parts: string[], value: string | null | undefined) {
  const v = (value ?? '').trim();
  if (!v) return;
  parts.push(v);
  const compact = compactId(v);
  if (compact && compact !== v.toLowerCase()) parts.push(compact);
}

/** Build a searchable blob for one customer, including related visit/device/transaction IDs. */
export function buildCustomerSearchBlob(
  customer: Customer,
  input: Omit<CustomerSearchInput, 'customers'>,
): string {
  const parts: string[] = [];
  pushPart(parts, customer.id);
  pushPart(parts, customer.customerCode);
  pushPart(parts, customer.firstName);
  pushPart(parts, customer.middleName);
  pushPart(parts, customer.lastName);
  pushPart(parts, `${customer.firstName} ${customer.lastName}`);
  pushPart(parts, `${customer.firstName} ${customer.middleName} ${customer.lastName}`);
  pushPart(parts, customer.phone);
  pushPart(parts, digitsOnly(customer.phone));
  pushPart(parts, customer.email);
  pushPart(parts, customer.idNumber);
  pushPart(parts, customer.idType);

  for (const visit of input.visits) {
    if (visit.customerId !== customer.id) continue;
    pushPart(parts, visit.id);
    pushPart(parts, visit.visitCode);
  }

  const purchaseIds = new Set<string>();
  for (const purchase of input.purchases) {
    if (purchase.customerId !== customer.id) continue;
    purchaseIds.add(purchase.id);
    pushPart(parts, purchase.id);
  }

  const purchaseItemIds = new Set<string>();
  for (const item of input.purchaseItems) {
    if (!purchaseIds.has(item.purchaseTransactionId)) continue;
    purchaseItemIds.add(item.id);
    pushPart(parts, item.brand);
    pushPart(parts, item.model);
    pushPart(parts, `${item.brand} ${item.model}`);
    pushPart(parts, item.serialImei);
    pushPart(parts, item.category);
  }

  for (const inv of input.inventory) {
    if (inv.sourcePurchaseItemId && purchaseItemIds.has(inv.sourcePurchaseItemId)) {
      pushPart(parts, inv.deviceCode);
      pushPart(parts, inv.serialImei);
      pushPart(parts, inv.brand);
      pushPart(parts, inv.model);
      pushPart(parts, `${inv.brand} ${inv.model}`);
    }
  }

  const saleIds = new Set<string>();
  for (const sale of input.sales) {
    if (sale.customerId !== customer.id) continue;
    saleIds.add(sale.id);
    pushPart(parts, sale.id);
    pushPart(parts, sale.saleCode);
  }

  const saleInventoryIds = new Set<string>();
  for (const item of input.saleItems) {
    if (!saleIds.has(item.salesTransactionId)) continue;
    pushPart(parts, item.brand);
    pushPart(parts, item.model);
    pushPart(parts, `${item.brand} ${item.model}`);
    pushPart(parts, item.serialImei);
    pushPart(parts, item.category);
    if (item.inventoryItemId) saleInventoryIds.add(item.inventoryItemId);
  }

  for (const inv of input.inventory) {
    if (!saleInventoryIds.has(inv.id)) continue;
    pushPart(parts, inv.deviceCode);
    pushPart(parts, inv.serialImei);
  }

  for (const ret of input.returns) {
    if (ret.customerId !== customer.id) continue;
    pushPart(parts, ret.id);
    pushPart(parts, ret.returnCode);
    pushPart(parts, ret.sourceTransactionId);
  }

  return parts.join(' ').toLowerCase();
}

export function buildCustomerSearchIndex(input: CustomerSearchInput): Map<string, string> {
  const related = {
    visits: input.visits,
    purchases: input.purchases,
    purchaseItems: input.purchaseItems,
    inventory: input.inventory,
    sales: input.sales,
    saleItems: input.saleItems,
    returns: input.returns,
  };
  const index = new Map<string, string>();
  for (const customer of input.customers) {
    index.set(customer.id, buildCustomerSearchBlob(customer, related));
  }
  return index;
}

export function matchesCustomerSearch(blob: string | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (!blob) return false;
  if (blob.includes(q)) return true;
  const compact = compactId(q);
  if (compact !== q && blob.includes(compact)) return true;
  const digits = digitsOnly(q);
  if (digits.length >= 3 && blob.includes(digits)) return true;
  return false;
}

export function buildCustomerListStats(input: CustomerSearchInput): Map<string, CustomerListStats> {
  const stats = new Map<string, CustomerListStats>();
  const ensure = (customerId: string): CustomerListStats => {
    let row = stats.get(customerId);
    if (!row) {
      row = {
        visitCount: 0,
        lastVisitAt: null,
        devicesPurchasedFromCustomer: 0,
        devicesSoldToCustomer: 0,
        totalPaidToCustomer: 0,
        totalCustomerSpend: 0,
      };
      stats.set(customerId, row);
    }
    return row;
  };

  for (const customer of input.customers) ensure(customer.id);

  for (const visit of input.visits) {
    const row = ensure(visit.customerId);
    row.visitCount += 1;
    if (!row.lastVisitAt || visit.createdAt > row.lastVisitAt) row.lastVisitAt = visit.createdAt;
  }

  const completedPurchaseIds = new Set<string>();
  const purchaseCustomerById = new Map<string, string>();
  for (const purchase of input.purchases) {
    purchaseCustomerById.set(purchase.id, purchase.customerId);
    if (purchase.status !== 'completed') continue;
    completedPurchaseIds.add(purchase.id);
    ensure(purchase.customerId).totalPaidToCustomer += purchase.totalAmount;
  }

  for (const item of input.purchaseItems) {
    if (!completedPurchaseIds.has(item.purchaseTransactionId)) continue;
    const customerId = purchaseCustomerById.get(item.purchaseTransactionId);
    if (!customerId) continue;
    ensure(customerId).devicesPurchasedFromCustomer += item.quantity;
  }

  const completedSaleIds = new Set<string>();
  const saleCustomerById = new Map<string, string>();
  for (const sale of input.sales) {
    if (!sale.customerId) continue;
    saleCustomerById.set(sale.id, sale.customerId);
    if (sale.status !== 'completed' && sale.status !== 'partially-returned') continue;
    completedSaleIds.add(sale.id);
    ensure(sale.customerId).totalCustomerSpend += sale.totalAmount;
  }

  for (const item of input.saleItems) {
    if (!completedSaleIds.has(item.salesTransactionId)) continue;
    const customerId = saleCustomerById.get(item.salesTransactionId);
    if (!customerId) continue;
    ensure(customerId).devicesSoldToCustomer += item.quantity;
  }

  return stats;
}

export function buildCustomerListRows(input: CustomerSearchInput, query = ''): CustomerListRow[] {
  const index = buildCustomerSearchIndex(input);
  const stats = buildCustomerListStats(input);
  const q = query.trim();

  const rows: CustomerListRow[] = [];
  for (const customer of input.customers) {
    if (!matchesCustomerSearch(index.get(customer.id), q)) continue;
    const s = stats.get(customer.id) ?? {
      visitCount: 0,
      lastVisitAt: null,
      devicesPurchasedFromCustomer: 0,
      devicesSoldToCustomer: 0,
      totalPaidToCustomer: 0,
      totalCustomerSpend: 0,
    };
    rows.push({ customer, ...s });
  }

  rows.sort((a, b) => {
    const aTime = a.lastVisitAt || a.customer.createdAt;
    const bTime = b.lastVisitAt || b.customer.createdAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return rows;
}

export function storewideCustomerKpis(input: CustomerSearchInput) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const stats = buildCustomerListStats(input);

  let customersThisMonth = 0;
  let devicesPurchased = 0;
  let devicesSold = 0;
  let lifetimePurchaseValue = 0;

  for (const customer of input.customers) {
    if (new Date(customer.createdAt).getTime() >= monthStart) customersThisMonth += 1;
    const row = stats.get(customer.id);
    if (!row) continue;
    devicesPurchased += row.devicesPurchasedFromCustomer;
    devicesSold += row.devicesSoldToCustomer;
    lifetimePurchaseValue += row.totalPaidToCustomer;
  }

  return {
    totalCustomers: input.customers.length,
    customersThisMonth,
    devicesPurchased,
    devicesSold,
    lifetimePurchaseValue,
  };
}
