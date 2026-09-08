import { PAYMENT_METHODS } from '@/constants/config';
import { compactId, digitsOnly, matchesCustomerSearch } from '@/lib/customerSearch';
import { getInventoryLifecycleLabel } from '@/lib/inventorySearch';
import { getReturnEligibility } from '@/lib/returnSaleSearch';
import type {
  Customer,
  InventoryItem,
  PaymentMethod,
  Return,
  SaleItem,
  SaleTransaction,
  TransactionPayment,
} from '@/types';

export type SalesHistoryDatePreset = 'all' | 'today' | '7d' | '30d' | 'custom';
export type SalesHistoryReturnLabel = 'No Return' | 'Partially Returned' | 'Returned';

export interface SalesHistoryFilters {
  datePreset: SalesHistoryDatePreset;
  customFrom?: string;
  customTo?: string;
  employeeId?: string;
  paymentMethod?: string;
  saleStatus?: string;
  returnStatus?: string;
}

export const DEFAULT_SALES_HISTORY_FILTERS: SalesHistoryFilters = {
  datePreset: 'all',
};

export interface SalesHistoryInput {
  sales: SaleTransaction[];
  saleItems: SaleItem[];
  salePayments: TransactionPayment[];
  inventory: InventoryItem[];
  customers: Customer[];
  returns: Return[];
  employeesById: Map<string, string>;
  storeId?: string;
}

export interface SalesHistoryLine {
  item: SaleItem;
  inventory?: InventoryItem;
  productName: string;
  deviceId: string;
  imei: string;
  serialNumber: string;
  skuBarcode: string;
  inventoryStatus: string;
  quantityReturned: number;
  quantityEligible: number;
  lineReturnStatus: SalesHistoryReturnLabel;
}

export interface SalesHistoryRow {
  sale: SaleTransaction;
  customer?: Customer;
  employeeName: string;
  itemCount: number;
  quantitySold: number;
  productSummary: string;
  paymentMethods: string[];
  paymentMethodValues: PaymentMethod[];
  statusLabel: string;
  returnStatus: SalesHistoryReturnLabel;
  canReprint: boolean;
  canReturn: boolean;
  items: SalesHistoryLine[];
  searchBlob: string;
  saleAt: string;
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
  if (method === 'shopify') return 'Shopify';
  return PAYMENT_METHODS.find((m) => m.value === method)?.label || method;
}

export function salesChannelLabel(channel: string | null | undefined): string {
  if (channel === 'shopify') return 'Shopify';
  if (channel === 'in-store') return 'In-Store';
  if (channel === 'online') return 'Online';
  if (channel === 'phone') return 'Phone';
  if (channel === 'marketplace') return 'Marketplace';
  return channel || '—';
}

export function saleStatusLabel(status: SaleTransaction['status']): string {
  if (status === 'completed') return 'Completed';
  if (status === 'voided') return 'Voided';
  if (status === 'partially-returned') return 'Partially Returned';
  if (status === 'draft') return 'Draft';
  return status;
}

export function deriveSaleReturnStatus(lines: Array<{ item: SaleItem; quantityReturned: number }>): SalesHistoryReturnLabel {
  const sold = lines.reduce((n, line) => n + line.item.quantity, 0);
  const returned = lines.reduce((n, line) => n + line.quantityReturned, 0);
  if (returned <= 0) return 'No Return';
  if (sold > 0 && returned >= sold) return 'Returned';
  return 'Partially Returned';
}

function lineReturnLabel(quantitySold: number, quantityReturned: number): SalesHistoryReturnLabel {
  if (quantityReturned <= 0) return 'No Return';
  if (quantityReturned >= quantitySold) return 'Returned';
  return 'Partially Returned';
}

export function buildSaleSearchBlob(args: {
  sale: SaleTransaction;
  customer?: Customer;
  employeeName: string;
  paymentMethods: string[];
  items: SalesHistoryLine[];
  returnStatus: string;
  statusLabel: string;
}): string {
  const parts: string[] = [];
  pushPart(parts, args.sale.id);
  pushPart(parts, args.sale.saleCode);
  pushPart(parts, args.sale.salesChannel);
  pushPart(parts, args.sale.shopifyOrderName);
  pushPart(parts, args.sale.shopifyOrderId);
  pushPart(parts, args.sale.shopifyCustomerName);
  pushPart(parts, args.sale.shopifyCustomerEmail);
  pushPart(parts, args.employeeName);
  pushPart(parts, args.statusLabel);
  pushPart(parts, args.returnStatus);
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
  } else {
    pushPart(parts, 'Walk-in');
  }

  for (const line of args.items) {
    pushPart(parts, line.item.id);
    pushPart(parts, line.item.brand);
    pushPart(parts, line.item.model);
    pushPart(parts, line.productName);
    pushPart(parts, line.item.category);
    pushPart(parts, line.item.serialImei);
    pushPart(parts, line.imei);
    pushPart(parts, line.serialNumber);
    pushPart(parts, line.deviceId);
    pushPart(parts, line.skuBarcode);
    pushPart(parts, line.inventory?.id);
    pushPart(parts, line.inventory?.deviceCode);
    pushPart(parts, line.inventory?.serialImei);
  }

  return parts.join(' ').toLowerCase();
}

export function matchesSaleSearch(blob: string | undefined, query: string): boolean {
  return matchesCustomerSearch(blob, query);
}

function startOfLocalDay(d = new Date()): Date {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function saleMatchesDateFilter(saleAt: Date, filters: SalesHistoryFilters): boolean {
  if (filters.datePreset === 'all') return true;

  const today = startOfLocalDay();
  if (filters.datePreset === 'today') return saleAt >= today;

  if (filters.datePreset === '7d') {
    const from = startOfLocalDay();
    from.setDate(from.getDate() - 6);
    return saleAt >= from;
  }

  if (filters.datePreset === '30d') {
    const from = startOfLocalDay();
    from.setDate(from.getDate() - 29);
    return saleAt >= from;
  }

  if (filters.customFrom) {
    const from = new Date(`${filters.customFrom}T00:00:00`);
    if (saleAt < from) return false;
  }
  if (filters.customTo) {
    const to = new Date(`${filters.customTo}T23:59:59.999`);
    if (saleAt > to) return false;
  }
  return true;
}

function productSummary(items: SalesHistoryLine[]): string {
  if (items.length === 0) return '—';
  const names = items.map((line) => line.productName).filter(Boolean);
  if (names.length === 0) return '—';
  if (names.length <= 2) return names.join(', ');
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

export function buildSalesHistoryRows(
  input: SalesHistoryInput,
  query = '',
  filters: SalesHistoryFilters = DEFAULT_SALES_HISTORY_FILTERS,
): SalesHistoryRow[] {
  const customerById = new Map(input.customers.map((c) => [c.id, c]));
  const inventoryById = new Map(input.inventory.map((i) => [i.id, i]));

  const itemsBySaleId = new Map<string, SaleItem[]>();
  for (const item of input.saleItems) {
    const list = itemsBySaleId.get(item.salesTransactionId) || [];
    list.push(item);
    itemsBySaleId.set(item.salesTransactionId, list);
  }

  const paymentsBySaleId = new Map<string, TransactionPayment[]>();
  for (const payment of input.salePayments) {
    if (payment.transactionType !== 'sale') continue;
    const list = paymentsBySaleId.get(payment.transactionId) || [];
    list.push(payment);
    paymentsBySaleId.set(payment.transactionId, list);
  }

  const saleReturns = input.returns.filter((r) => r.sourceTransactionType === 'sale');

  const rows: SalesHistoryRow[] = [];
  for (const sale of input.sales) {
    if (input.storeId && sale.storeId && sale.storeId !== input.storeId) continue;
    if (sale.status === 'draft') continue;

    const saleItems = (itemsBySaleId.get(sale.id) || []).slice().sort((a, b) => a.lineNumber - b.lineNumber);
    const payments = paymentsBySaleId.get(sale.id) || [];
    const methods = [...new Set(payments.map((p) => p.method))] as PaymentMethod[];
    const items: SalesHistoryLine[] = saleItems.map((item) => {
      const inventory = item.inventoryItemId ? inventoryById.get(item.inventoryItemId) : undefined;
      const { quantityReturned, quantityEligible } = getReturnEligibility(item, saleReturns);
      const serial = item.serialImei || inventory?.serialImei || '';
      const deviceId = inventory?.deviceCode || '';
      return {
        item,
        inventory,
        productName: `${item.brand} ${item.model}`.trim(),
        deviceId,
        imei: serial,
        serialNumber: serial,
        skuBarcode: deviceId,
        inventoryStatus: inventory ? getInventoryLifecycleLabel(inventory.status) : 'Non-inventory',
        quantityReturned,
        quantityEligible,
        lineReturnStatus: lineReturnLabel(item.quantity, quantityReturned),
      };
    });

    const customer = sale.customerId ? customerById.get(sale.customerId) : undefined;
    const employeeName = input.employeesById.get(sale.employeeId) || 'Unknown';
    const statusLabel = saleStatusLabel(sale.status);
    const returnStatus = deriveSaleReturnStatus(items);
    const saleAt = sale.completedAt || sale.createdAt;
    const row: SalesHistoryRow = {
      sale,
      customer,
      employeeName,
      itemCount: items.length,
      quantitySold: items.reduce((n, line) => n + line.item.quantity, 0),
      productSummary: productSummary(items),
      paymentMethods: methods.map(paymentMethodLabel),
      paymentMethodValues: methods,
      statusLabel,
      returnStatus,
      canReprint: sale.status === 'completed' || sale.status === 'partially-returned',
      canReturn: sale.status !== 'voided' && items.some((line) => line.quantityEligible > 0),
      items,
      searchBlob: '',
      saleAt,
    };
    row.searchBlob = buildSaleSearchBlob({
      sale,
      customer,
      employeeName,
      paymentMethods: methods,
      items,
      returnStatus,
      statusLabel,
    });
    rows.push(row);
  }

  const q = query.trim();
  let filtered = q ? rows.filter((row) => matchesSaleSearch(row.searchBlob, q)) : rows;

  filtered = filtered.filter((row) => {
    if (!saleMatchesDateFilter(new Date(row.saleAt), filters)) return false;
    if (filters.employeeId && row.sale.employeeId !== filters.employeeId) return false;
    if (filters.paymentMethod && !row.paymentMethodValues.includes(filters.paymentMethod as PaymentMethod)) return false;
    if (filters.saleStatus && filters.saleStatus !== 'all' && row.sale.status !== filters.saleStatus) return false;
    if (filters.returnStatus && filters.returnStatus !== 'all' && row.returnStatus !== filters.returnStatus) return false;
    return true;
  });

  filtered.sort((a, b) => new Date(b.saleAt).getTime() - new Date(a.saleAt).getTime());
  return filtered;
}
