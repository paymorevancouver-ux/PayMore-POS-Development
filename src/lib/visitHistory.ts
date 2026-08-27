import { PAYMENT_METHODS } from '@/constants/config';
import { compactId, digitsOnly, matchesCustomerSearch } from '@/lib/customerSearch';
import { formatStorageLocation } from '@/lib/customer360';
import { getInventoryLifecycleLabel } from '@/lib/inventorySearch';
import type {
  Customer,
  CustomerVisit,
  InventoryItem,
  PaymentMethod,
  PurchaseItem,
  PurchaseTransaction,
  TransactionPayment,
} from '@/types';

export interface VisitHistoryInput {
  visits: CustomerVisit[];
  customers: Customer[];
  purchases: PurchaseTransaction[];
  purchaseItems: PurchaseItem[];
  purchasePayments: TransactionPayment[];
  inventory: InventoryItem[];
  employeesById: Map<string, string>;
  storeId?: string;
}

export interface VisitHistoryDevice {
  item: PurchaseItem;
  inventory?: InventoryItem;
  deviceId: string;
  product: string;
  currentStatus: string;
  currentLocation: string | null;
}

export interface VisitHistoryRow {
  visit: CustomerVisit;
  customer?: Customer;
  purchase?: PurchaseTransaction;
  employeeName: string;
  deviceCount: number;
  purchaseAmount: number;
  paymentMethods: string[];
  status: string;
  canReprint: boolean;
  devices: VisitHistoryDevice[];
  searchBlob: string;
}

function pushPart(parts: string[], value: string | null | undefined) {
  const v = (value ?? '').trim();
  if (!v) return;
  parts.push(v);
  const compact = compactId(v);
  if (compact && compact !== v.toLowerCase()) parts.push(compact);
  const digits = digitsOnly(v);
  if (digits.length >= 3 && digits !== v) parts.push(digits);
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label || method;
}

export function visitStatusLabel(purchase?: PurchaseTransaction): string {
  if (!purchase) return 'Open';
  if (purchase.status === 'completed') return 'Completed';
  if (purchase.status === 'draft') return 'In Progress';
  if (purchase.status === 'voided') return 'Voided';
  return purchase.status;
}

export function buildVisitSearchBlob(args: {
  visit: CustomerVisit;
  customer?: Customer;
  purchase?: PurchaseTransaction;
  devices: VisitHistoryDevice[];
  employeeName: string;
  paymentMethods: string[];
}): string {
  const parts: string[] = [];
  pushPart(parts, args.visit.id);
  pushPart(parts, args.visit.visitCode);
  pushPart(parts, args.employeeName);
  pushPart(parts, args.purchase?.id);
  pushPart(parts, args.purchase?.status);
  for (const method of args.paymentMethods) {
    pushPart(parts, method);
    pushPart(parts, paymentMethodLabel(method));
  }

  const customer = args.customer;
  if (customer) {
    pushPart(parts, customer.id);
    pushPart(parts, customer.customerCode);
    pushPart(parts, customer.firstName);
    pushPart(parts, customer.middleName);
    pushPart(parts, customer.lastName);
    pushPart(parts, `${customer.firstName} ${customer.lastName}`);
    pushPart(parts, `${customer.firstName} ${customer.middleName} ${customer.lastName}`);
    pushPart(parts, customer.phone);
    pushPart(parts, customer.email);
    pushPart(parts, customer.idNumber);
  }

  for (const device of args.devices) {
    pushPart(parts, device.deviceId);
    pushPart(parts, device.inventory?.id);
    pushPart(parts, device.item.id);
    pushPart(parts, device.item.brand);
    pushPart(parts, device.item.model);
    pushPart(parts, device.product);
    pushPart(parts, device.item.serialImei);
    pushPart(parts, device.inventory?.serialImei);
    pushPart(parts, device.item.category);
    pushPart(parts, device.currentStatus);
  }

  return parts.join(' ').toLowerCase();
}

export function matchesVisitSearch(blob: string | undefined, query: string): boolean {
  return matchesCustomerSearch(blob, query);
}

export function buildVisitHistoryRows(input: VisitHistoryInput, query = ''): VisitHistoryRow[] {
  const customerById = new Map(input.customers.map((c) => [c.id, c]));
  const purchaseByVisitId = new Map<string, PurchaseTransaction>();
  const otherStoreVisitIds = new Set<string>();
  for (const purchase of input.purchases) {
    if (input.storeId && purchase.storeId && purchase.storeId !== input.storeId) {
      otherStoreVisitIds.add(purchase.visitId);
      continue;
    }
    const existing = purchaseByVisitId.get(purchase.visitId);
    if (!existing || purchase.createdAt > existing.createdAt) {
      purchaseByVisitId.set(purchase.visitId, purchase);
    }
  }

  const itemsByPurchaseId = new Map<string, PurchaseItem[]>();
  for (const item of input.purchaseItems) {
    const list = itemsByPurchaseId.get(item.purchaseTransactionId) || [];
    list.push(item);
    itemsByPurchaseId.set(item.purchaseTransactionId, list);
  }

  const paymentsByPurchaseId = new Map<string, TransactionPayment[]>();
  for (const payment of input.purchasePayments) {
    if (payment.transactionType !== 'purchase') continue;
    const list = paymentsByPurchaseId.get(payment.transactionId) || [];
    list.push(payment);
    paymentsByPurchaseId.set(payment.transactionId, list);
  }

  const inventoryByPurchaseItemId = new Map<string, InventoryItem>();
  for (const inv of input.inventory) {
    if (!inv.sourcePurchaseItemId) continue;
    if (input.storeId && inv.storeId && inv.storeId !== input.storeId) continue;
    inventoryByPurchaseItemId.set(inv.sourcePurchaseItemId, inv);
  }

  const rows: VisitHistoryRow[] = [];
  for (const visit of input.visits) {
    if (input.storeId && otherStoreVisitIds.has(visit.id) && !purchaseByVisitId.has(visit.id)) continue;
    const purchase = purchaseByVisitId.get(visit.id);

    const items = purchase ? (itemsByPurchaseId.get(purchase.id) || []) : [];
    const payments = purchase ? (paymentsByPurchaseId.get(purchase.id) || []) : [];
    const methods = [...new Set(payments.map((p) => p.method))] as PaymentMethod[];
    const devices: VisitHistoryDevice[] = items.map((item) => {
      const inventory = inventoryByPurchaseItemId.get(item.id);
      return {
        item,
        inventory,
        deviceId: inventory?.deviceCode || item.id,
        product: `${item.brand} ${item.model}`.trim(),
        currentStatus: inventory
          ? getInventoryLifecycleLabel(inventory.status)
          : (purchase?.status === 'draft' ? 'Draft' : 'Not inventoried'),
        currentLocation: formatStorageLocation(inventory),
      };
    });

    const customer = customerById.get(visit.customerId);
    const employeeName = input.employeesById.get(visit.employeeId) || 'Unknown';
    const status = visitStatusLabel(purchase);
    const row: VisitHistoryRow = {
      visit,
      customer,
      purchase,
      employeeName,
      deviceCount: items.reduce((n, i) => n + i.quantity, 0),
      purchaseAmount: purchase?.status === 'voided' ? 0 : (purchase?.totalAmount || 0),
      paymentMethods: methods.map(paymentMethodLabel),
      status,
      canReprint: purchase?.status === 'completed',
      devices,
      searchBlob: '',
    };
    row.searchBlob = buildVisitSearchBlob({
      visit,
      customer,
      purchase,
      devices,
      employeeName,
      paymentMethods: methods,
    });
    rows.push(row);
  }

  const q = query.trim();
  const filtered = q ? rows.filter((row) => matchesVisitSearch(row.searchBlob, q)) : rows;
  filtered.sort((a, b) => new Date(b.visit.createdAt).getTime() - new Date(a.visit.createdAt).getTime());
  return filtered;
}
