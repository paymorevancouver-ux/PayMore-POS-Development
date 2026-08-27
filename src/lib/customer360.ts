import { getInventoryLifecycleLabel } from '@/lib/inventorySearch';
import type {
  AuditLogEntry,
  Customer,
  CustomerVisit,
  InventoryItem,
  LocationHistoryEntry,
  PurchaseItem,
  PurchaseTransaction,
  Return,
  SaleItem,
  SaleTransaction,
  TransactionPayment,
} from '@/types';

export interface Customer360Input {
  customer: Customer;
  visits: CustomerVisit[];
  purchases: PurchaseTransaction[];
  purchaseItems: PurchaseItem[];
  purchasePayments: TransactionPayment[];
  inventory: InventoryItem[];
  sales: SaleTransaction[];
  saleItems: SaleItem[];
  salePayments: TransactionPayment[];
  returns: Return[];
  auditLog: AuditLogEntry[];
  employeesById: Map<string, string>;
}

export interface CustomerLifetimeStats {
  devicesSoldToStore: number;
  purchaseTransactions: number;
  amountPaidToCustomer: number;
  averageBuyPercentage: number | null;
  lastPurchaseAt: string | null;
  itemsPurchasedByCustomer: number;
  salesTransactions: number;
  customerSpend: number;
  lastSaleAt: string | null;
  visitCount: number;
  returnCount: number;
  openTransactions: number;
}

export type DeviceTransactionType = 'Sold to PayMore' | 'Purchased from PayMore' | 'Returned';

export interface CustomerDeviceRow {
  key: string;
  deviceId: string;
  brand: string;
  model: string;
  productName: string;
  serialImei: string;
  category: string;
  transactionType: DeviceTransactionType;
  transactionDate: string;
  transactionId: string;
  costOrOffer: number | null;
  salePrice: number | null;
  currentStatus: string;
  currentLocation: string | null;
  inventoryId?: string;
}

export interface CustomerVisitRow {
  visit: CustomerVisit;
  employeeName: string;
  deviceCount: number;
  status: string;
  amount: number;
  purchaseId?: string;
}

export interface CustomerPurchaseRow {
  purchase: PurchaseTransaction;
  employeeName: string;
  productCount: number;
  paymentMethods: string[];
  items: Array<PurchaseItem & { inventory?: InventoryItem }>;
}

export interface CustomerSaleRow {
  sale: SaleTransaction;
  employeeName: string;
  paymentMethods: string[];
  returnStatus: string;
  items: SaleItem[];
}

export interface CustomerReturnRow {
  ret: Return;
  originalSaleCode: string;
  product: string;
  quantity: number;
  employeeName: string;
}

export interface CustomerTimelineEvent {
  id: string;
  at: string;
  label: string;
  detail: string;
}

export function formatStorageLocation(item: InventoryItem | undefined): string | null {
  if (!item) return null;
  if (item.storageRack) {
    const rackNum = item.storageRack.replace(/^R/i, '');
    const row = item.storageRow || '';
    return row ? `Rack ${rackNum} / ${row}` : `Rack ${rackNum}`;
  }
  return item.storageLocation;
}

function employeeName(employeesById: Map<string, string>, id: string): string {
  return employeesById.get(id) || 'Unknown';
}

export function getCustomerLifetimeStats(input: Customer360Input): CustomerLifetimeStats {
  const { customer } = input;
  const visits = input.visits.filter((v) => v.customerId === customer.id);
  const purchases = input.purchases.filter((p) => p.customerId === customer.id);
  const completedPurchases = purchases.filter((p) => p.status === 'completed');
  const purchaseIds = new Set(completedPurchases.map((p) => p.id));
  const purchaseItems = input.purchaseItems.filter((i) => purchaseIds.has(i.purchaseTransactionId));

  const sales = input.sales.filter(
    (s) => s.customerId === customer.id && (s.status === 'completed' || s.status === 'partially-returned'),
  );
  const saleIds = new Set(sales.map((s) => s.id));
  const saleItems = input.saleItems.filter((i) => saleIds.has(i.salesTransactionId));
  const returns = input.returns.filter((r) => r.customerId === customer.id && r.status === 'completed');

  const openPurchases = purchases.filter((p) => p.status === 'draft').length;
  const openSales = input.sales.filter((s) => s.customerId === customer.id && s.status === 'draft').length;

  let buyPctSum = 0;
  let buyPctCount = 0;
  for (const item of purchaseItems) {
    if (item.estimatedSalePrice > 0) {
      buyPctSum += (item.buyPrice / item.estimatedSalePrice) * 100;
      buyPctCount += 1;
    }
  }

  const lastPurchaseAt = completedPurchases.reduce<string | null>((latest, p) => {
    if (!latest || p.createdAt > latest) return p.createdAt;
    return latest;
  }, null);

  const lastSaleAt = sales.reduce<string | null>((latest, s) => {
    const at = s.completedAt || s.createdAt;
    if (!latest || at > latest) return at;
    return latest;
  }, null);

  return {
    devicesSoldToStore: purchaseItems.reduce((n, i) => n + i.quantity, 0),
    purchaseTransactions: completedPurchases.length,
    amountPaidToCustomer: completedPurchases.reduce((n, p) => n + p.totalAmount, 0),
    averageBuyPercentage: buyPctCount > 0 ? buyPctSum / buyPctCount : null,
    lastPurchaseAt,
    itemsPurchasedByCustomer: saleItems.reduce((n, i) => n + i.quantity, 0),
    salesTransactions: sales.length,
    customerSpend: sales.reduce((n, s) => n + s.totalAmount, 0),
    lastSaleAt,
    visitCount: visits.length,
    returnCount: returns.length,
    openTransactions: openPurchases + openSales,
  };
}

export function getCustomerVisits(input: Customer360Input): CustomerVisitRow[] {
  const visits = input.visits
    .filter((v) => v.customerId === input.customer.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return visits.map((visit) => {
    const purchase = input.purchases.find((p) => p.visitId === visit.id);
    const items = purchase
      ? input.purchaseItems.filter((i) => i.purchaseTransactionId === purchase.id)
      : [];
    let status = 'Open';
    if (purchase?.status === 'completed') status = 'Completed';
    else if (purchase?.status === 'draft') status = 'In Progress';
    else if (purchase?.status === 'voided') status = 'Voided';
    return {
      visit,
      employeeName: employeeName(input.employeesById, visit.employeeId),
      deviceCount: items.reduce((n, i) => n + i.quantity, 0),
      status,
      amount: purchase?.status === 'completed' ? purchase.totalAmount : 0,
      purchaseId: purchase?.id,
    };
  });
}

export function getCustomerPurchases(input: Customer360Input): CustomerPurchaseRow[] {
  const purchases = input.purchases
    .filter((p) => p.customerId === input.customer.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return purchases.map((purchase) => {
    const items = input.purchaseItems
      .filter((i) => i.purchaseTransactionId === purchase.id)
      .map((item) => ({
        ...item,
        inventory: input.inventory.find((inv) => inv.sourcePurchaseItemId === item.id),
      }));
    const payments = input.purchasePayments.filter((p) => p.transactionId === purchase.id);
    return {
      purchase,
      employeeName: employeeName(input.employeesById, purchase.employeeId),
      productCount: items.reduce((n, i) => n + i.quantity, 0),
      paymentMethods: [...new Set(payments.map((p) => p.method))],
      items,
    };
  });
}

export function getCustomerSales(input: Customer360Input): CustomerSaleRow[] {
  const sales = input.sales
    .filter((s) => s.customerId === input.customer.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const customerReturns = input.returns.filter(
    (r) => r.customerId === input.customer.id && r.status === 'completed',
  );

  return sales.map((sale) => {
    const items = input.saleItems.filter((i) => i.salesTransactionId === sale.id);
    const payments = input.salePayments.filter((p) => p.transactionId === sale.id);
    const saleReturns = customerReturns.filter((r) => r.sourceTransactionId === sale.id);
    let returnStatus = 'None';
    if (sale.status === 'partially-returned') returnStatus = 'Partial';
    else if (saleReturns.length > 0) returnStatus = 'Returned';
    return {
      sale,
      employeeName: employeeName(input.employeesById, sale.employeeId),
      paymentMethods: [...new Set(payments.map((p) => p.method))],
      returnStatus,
      items,
    };
  });
}

export function getCustomerReturns(input: Customer360Input): CustomerReturnRow[] {
  return input.returns
    .filter((r) => r.customerId === input.customer.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((ret) => {
      const sale = input.sales.find((s) => s.id === ret.sourceTransactionId);
      const saleItem = ret.sourceItemId
        ? input.saleItems.find((i) => i.id === ret.sourceItemId)
        : input.saleItems.find((i) => i.salesTransactionId === ret.sourceTransactionId);
      const perUnit = saleItem && saleItem.quantity > 0 ? saleItem.lineTotal / saleItem.quantity : 0;
      const quantity = perUnit > 0 ? Math.max(1, Math.round(ret.returnAmount / perUnit)) : 1;
      return {
        ret,
        originalSaleCode: sale?.saleCode || ret.sourceTransactionId,
        product: saleItem ? `${saleItem.brand} ${saleItem.model}` : '—',
        quantity,
        employeeName: employeeName(input.employeesById, ret.employeeId),
      };
    });
}

export function getCustomerDeviceHistory(input: Customer360Input): CustomerDeviceRow[] {
  const rows: CustomerDeviceRow[] = [];
  const purchases = getCustomerPurchases(input);
  for (const row of purchases) {
    if (row.purchase.status === 'voided') continue;
    for (const item of row.items) {
      const inv = item.inventory;
      rows.push({
        key: `buy-${item.id}`,
        deviceId: inv?.deviceCode || item.id,
        brand: item.brand,
        model: item.model,
        productName: `${item.brand} ${item.model}`.trim(),
        serialImei: inv?.serialImei || item.serialImei,
        category: item.category,
        transactionType: 'Sold to PayMore',
        transactionDate: row.purchase.createdAt,
        transactionId: row.purchase.id,
        costOrOffer: item.buyPrice,
        salePrice: null,
        currentStatus: inv ? getInventoryLifecycleLabel(inv.status) : (row.purchase.status === 'draft' ? 'Draft' : 'Not inventoried'),
        currentLocation: formatStorageLocation(inv),
        inventoryId: inv?.id,
      });
    }
  }

  const sales = getCustomerSales(input);
  for (const row of sales) {
    if (row.sale.status === 'voided' || row.sale.status === 'draft') continue;
    for (const item of row.items) {
      const inv = item.inventoryItemId
        ? input.inventory.find((i) => i.id === item.inventoryItemId)
        : undefined;
      rows.push({
        key: `sell-${item.id}`,
        deviceId: inv?.deviceCode || item.id,
        brand: item.brand,
        model: item.model,
        productName: `${item.brand} ${item.model}`.trim(),
        serialImei: inv?.serialImei || item.serialImei,
        category: item.category,
        transactionType: 'Purchased from PayMore',
        transactionDate: row.sale.completedAt || row.sale.createdAt,
        transactionId: row.sale.saleCode || row.sale.id,
        costOrOffer: null,
        salePrice: item.unitPrice,
        currentStatus: inv ? getInventoryLifecycleLabel(inv.status) : 'Sold',
        currentLocation: formatStorageLocation(inv),
        inventoryId: inv?.id,
      });
    }
  }

  for (const ret of getCustomerReturns(input)) {
    rows.push({
      key: `ret-${ret.ret.id}`,
      deviceId: ret.ret.returnCode,
      brand: '',
      model: ret.product,
      productName: ret.product,
      serialImei: '',
      category: '',
      transactionType: 'Returned',
      transactionDate: ret.ret.completedAt || ret.ret.createdAt,
      transactionId: ret.ret.returnCode,
      costOrOffer: null,
      salePrice: ret.ret.returnAmount,
      currentStatus: 'Returned',
      currentLocation: null,
    });
  }

  return rows.sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
}

export function buildCustomerTimeline(input: Customer360Input): CustomerTimelineEvent[] {
  const events: CustomerTimelineEvent[] = [];
  const { customer } = input;

  events.push({
    id: `created-${customer.id}`,
    at: customer.createdAt,
    label: 'Customer created',
    detail: 'Customer record created',
  });

  for (const visit of input.visits.filter((v) => v.customerId === customer.id)) {
    events.push({
      id: `visit-${visit.id}`,
      at: visit.createdAt,
      label: 'Visit started',
      detail: visit.visitCode,
    });
  }

  for (const purchase of input.purchases.filter((p) => p.customerId === customer.id && p.status === 'completed')) {
    events.push({
      id: `purchase-${purchase.id}`,
      at: purchase.createdAt,
      label: 'Purchase completed',
      detail: `Paid ${purchase.totalAmount.toFixed(2)}`,
    });
  }

  const purchaseItemIds = new Set(
    input.purchaseItems
      .filter((i) => input.purchases.some((p) => p.id === i.purchaseTransactionId && p.customerId === customer.id))
      .map((i) => i.id),
  );

  for (const inv of input.inventory) {
    if (!inv.sourcePurchaseItemId || !purchaseItemIds.has(inv.sourcePurchaseItemId)) continue;
    events.push({
      id: `inv-${inv.id}`,
      at: inv.acquiredAt,
      label: 'Device moved to inventory',
      detail: inv.deviceCode,
    });
    if (inv.labelGenerated && inv.labelGeneratedAt) {
      events.push({
        id: `listed-${inv.id}`,
        at: inv.labelGeneratedAt,
        label: 'Device listed',
        detail: inv.deviceCode,
      });
    }
    if (inv.status === 'sold' && inv.soldAt) {
      events.push({
        id: `invsold-${inv.id}`,
        at: inv.soldAt,
        label: 'Device sold',
        detail: inv.deviceCode,
      });
    }
  }

  for (const sale of input.sales.filter((s) => s.customerId === customer.id && s.status !== 'draft' && s.status !== 'voided')) {
    events.push({
      id: `sale-${sale.id}`,
      at: sale.completedAt || sale.createdAt,
      label: 'Customer sale completed',
      detail: sale.saleCode,
    });
  }

  for (const ret of input.returns.filter((r) => r.customerId === customer.id && r.status === 'completed')) {
    events.push({
      id: `return-${ret.id}`,
      at: ret.completedAt || ret.createdAt,
      label: 'Return completed',
      detail: ret.returnCode,
    });
  }

  const relatedIds = new Set<string>([
    customer.id,
    ...input.visits.filter((v) => v.customerId === customer.id).map((v) => v.id),
    ...input.purchases.filter((p) => p.customerId === customer.id).map((p) => p.id),
    ...input.sales.filter((s) => s.customerId === customer.id).map((s) => s.id),
    ...input.returns.filter((r) => r.customerId === customer.id).map((r) => r.id),
  ]);

  for (const log of input.auditLog) {
    if (!relatedIds.has(log.recordId)) continue;
    if (log.action === 'CUSTOMER_NOTE') {
      events.push({
        id: `audit-${log.id}`,
        at: log.createdAt,
        label: 'Note added',
        detail: log.actorName,
      });
    } else if (log.action === 'CUSTOMER_UPDATE') {
      events.push({
        id: `audit-${log.id}`,
        at: log.createdAt,
        label: 'Customer information updated',
        detail: log.actorName,
      });
    }
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events;
}

export function appendCustomerNote(existing: string, note: string, employeeName: string, at = new Date().toISOString()): string {
  const stamp = `[${new Date(at).toLocaleString('en-CA')} · ${employeeName}]\n${note.trim()}`;
  const current = existing.trim();
  return current ? `${current}\n\n${stamp}` : stamp;
}

export function parseCustomerNotes(notes: string): Array<{ stamp?: string; body: string }> {
  const text = notes.trim();
  if (!text) return [];
  const chunks = text.split(/\n\n+/);
  return chunks.map((chunk) => {
    const match = chunk.match(/^\[(.+?)\]\n([\s\S]*)$/);
    if (match) return { stamp: match[1], body: match[2] };
    return { body: chunk };
  });
}

/** Unused in UI; kept so location history can be merged later without a new table. */
export function locationEventsForInventory(
  history: LocationHistoryEntry[],
  inventoryIds: Set<string>,
): CustomerTimelineEvent[] {
  return history
    .filter((h) => inventoryIds.has(h.inventoryItemId))
    .map((h) => ({
      id: `loc-${h.id}`,
      at: h.movedAt,
      label: 'Device location updated',
      detail: h.newLocation,
    }));
}
