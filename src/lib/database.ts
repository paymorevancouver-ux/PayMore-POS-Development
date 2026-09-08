/**
 * Database service layer for Paymore POS
 * All reads/writes go through Supabase — no localStorage persistence.
 * Every table is filtered by store_id for multi-location isolation.
 */

import { supabase } from '@/lib/supabase';
import type {
  Customer, CustomerVisit, PurchaseTransaction, PurchaseItem,
  TransactionPayment, InventoryItem, SaleTransaction, SaleItem,
  Return, PaymentChange, PurchaseChange, CashDrawerEntry,
  AuditLogEntry, LabelPrintLog, Employee, LocationHistoryEntry,
} from '@/types';
import type { ShopifyAccessory, ShopifyListing, ShopifyListingPhoto, ShopifyListingStatus, ShopifyTestResult } from '@/types/shopify';
import { getListerMeta } from '@/lib/shopify/listerMeta';
import { fromShopifyCategoryColumns, toShopifyCategoryColumns } from '@/lib/shopify/categoryPersistence';

// ── Generic helpers ──

async function query<T>(table: string, storeId: string, orderBy = 'created_at', asc = false): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('store_id', storeId)
    .order(orderBy, { ascending: asc });
  if (error) { console.error(`[DB] select ${table}:`, error); return []; }
  return (data || []) as T[];
}

async function insert<T extends Record<string, unknown>>(table: string, row: T): Promise<T | null> {
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) { console.error(`[DB] insert ${table}:`, error.message); return null; }
  return data as T;
}

async function update(table: string, id: string, updates: Record<string, unknown>): Promise<boolean> {
  const { error } = await supabase.from(table).update(updates).eq('id', id);
  if (error) { console.error(`[DB] update ${table}:`, error.message); return false; }
  return true;
}

async function upsertRow(table: string, row: Record<string, unknown>): Promise<boolean> {
  const { error } = await supabase.from(table).upsert(row);
  if (error) { console.error(`[DB] upsert ${table}:`, error.message); return false; }
  return true;
}

async function deleteRow(table: string, id: string): Promise<boolean> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) { console.error(`[DB] delete ${table}:`, error.message); return false; }
  return true;
}

// ── Mappers: DB snake_case → App camelCase ──

function mapCustomer(r: Record<string, unknown>): Customer {
  return {
    id: r.id as string, customerCode: r.customer_code as string,
    idType: r.id_type as Customer['idType'], idNumber: r.id_number as string,
    firstName: r.first_name as string, middleName: r.middle_name as string,
    lastName: r.last_name as string, dob: r.dob as string,
    address1: r.address1 as string, address2: r.address2 as string,
    city: r.city as string, province: r.province as string,
    postalCode: r.postal_code as string, phone: r.phone as string,
    email: r.email as string, sex: r.sex as string, race: r.race as string,
    weight: r.weight as string, height: r.height as string,
    notes: r.notes as string,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

function mapEmployee(r: Record<string, unknown>): Employee {
  return {
    id: r.id as string, fullName: r.full_name as string, email: r.email as string,
    pin: r.pin as string, role: r.role as Employee['role'],
    isActive: r.is_active as boolean, createdAt: r.created_at as string,
  };
}

function mapVisit(r: Record<string, unknown>): CustomerVisit {
  return {
    id: r.id as string, visitCode: r.visit_code as string,
    customerId: r.customer_id as string, employeeId: r.employee_id as string,
    visitType: r.visit_type as CustomerVisit['visitType'], notes: r.notes as string || '',
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

function mapPurchase(r: Record<string, unknown>): PurchaseTransaction {
  return {
    id: r.id as string, visitId: r.visit_id as string,
    customerId: r.customer_id as string, employeeId: r.employee_id as string,
    storeId: r.store_id as string, subtotal: Number(r.subtotal),
    taxTotal: Number(r.tax_total), totalAmount: Number(r.total_amount),
    notes: r.notes as string || '', status: r.status as PurchaseTransaction['status'],
    createdAt: r.created_at as string,
  };
}

function mapPurchaseItem(r: Record<string, unknown>): PurchaseItem {
  return {
    id: r.id as string, purchaseTransactionId: r.purchase_transaction_id as string,
    lineNumber: Number(r.line_number), category: r.category as string,
    brand: r.brand as string, model: r.model as string,
    serialImei: r.serial_imei as string || '', condition: r.condition as PurchaseItem['condition'],
    conditionNotes: r.condition_notes as string || '', inscription: r.inscription as string || '',
    photos: (r.photos as string[]) || [],
    specifications: (r.specifications as PurchaseItem['specifications']) || {},
    listingTitle: (r.listing_title as string) || '',
    quantity: Number(r.quantity), buyPrice: Number(r.buy_price),
    estimatedSalePrice: Number(r.estimated_sale_price) || 0,
    isDeal: r.is_deal as boolean, createdAt: r.created_at as string,
  };
}

function mapPayment(r: Record<string, unknown>): TransactionPayment {
  return {
    id: r.id as string, transactionType: r.transaction_type as TransactionPayment['transactionType'],
    transactionId: r.transaction_id as string, lineNumber: Number(r.line_number),
    method: r.method as TransactionPayment['method'], amount: Number(r.amount),
    reference: r.reference as string || '', createdAt: r.created_at as string,
  };
}

function mapInventory(r: Record<string, unknown>): InventoryItem {
  return {
    id: r.id as string, deviceCode: r.device_code as string,
    sourcePurchaseItemId: r.source_purchase_item_id as string || undefined,
    visitId: r.visit_id as string || undefined,
    category: r.category as string, brand: r.brand as string,
    model: r.model as string, serialImei: r.serial_imei as string || '',
    barcode: (r.barcode as string) || '',
    quantityOnHand: Number(r.quantity_on_hand), costPerUnit: Number(r.cost_per_unit),
    expectedSalePrice: Number(r.expected_sale_price),
    status: r.status as InventoryItem['status'], storeId: r.store_id as string,
    acquiredAt: r.acquired_at as string, soldAt: r.sold_at as string | null,
    notes: r.notes as string || '',
    // Storage location
    storageLocation: (r.storage_location as string) || null,
    storageRack: (r.storage_rack as string) || null,
    storageRow: (r.storage_row as string) || null,
    // Label tracking
    labelGenerated: Boolean(r.label_generated),
    labelGeneratedAt: (r.label_generated_at as string) || null,
    labelGeneratedBy: (r.label_generated_by as string) || null,
    labelPrintCount: Number(r.label_print_count) || 0,
    lastLabelPrintAt: (r.last_label_print_at as string) || null,
    lastLabelPrintBy: (r.last_label_print_by as string) || null,
    listingMethod: (r.listing_method as InventoryItem['listingMethod']) || null,
    processedAt: (r.processed_at as string) || null,
    processedByEmployeeId: (r.processed_by_employee_id as string) || null,
    specifications: (r.specifications as InventoryItem['specifications']) || {},
    listingTitle: (r.listing_title as string) || '',
  };
}

function mapLocationHistory(r: Record<string, unknown>): LocationHistoryEntry {
  return {
    id: r.id as string,
    storeId: r.store_id as string,
    inventoryItemId: r.inventory_item_id as string,
    oldLocation: (r.old_location as string) || null,
    newLocation: (r.new_location as string) || '',
    movedByEmployeeId: (r.moved_by_employee_id as string) || '',
    movedByName: (r.moved_by_name as string) || '',
    movedAt: r.moved_at as string,
    notes: (r.notes as string) || '',
  };
}

function mapSale(r: Record<string, unknown>): SaleTransaction {
  return {
    id: r.id as string, saleCode: r.sale_code as string,
    customerId: r.customer_id as string || undefined,
    employeeId: r.employee_id as string, storeId: r.store_id as string,
    subtotal: Number(r.subtotal), gstTotal: Number(r.gst_total),
    pstTotal: Number(r.pst_total), taxTotal: Number(r.tax_total),
    totalAmount: Number(r.total_amount),
    salesChannel: r.sales_channel as SaleTransaction['salesChannel'],
    notes: r.notes as string || '', status: r.status as SaleTransaction['status'],
    createdAt: r.created_at as string, completedAt: r.completed_at as string | null,
    shopifyOrderId: (r.shopify_order_id as string) || null,
    shopifyOrderName: (r.shopify_order_name as string) || null,
    shopifyCustomerName: (r.shopify_customer_name as string) || null,
    shopifyCustomerEmail: (r.shopify_customer_email as string) || null,
    shopifyOrderUrl: (r.shopify_order_url as string) || null,
  };
}

function mapSaleItem(r: Record<string, unknown>): SaleItem {
  return {
    id: r.id as string, salesTransactionId: r.sales_transaction_id as string,
    inventoryItemId: r.inventory_item_id as string || undefined,
    lineNumber: Number(r.line_number), category: r.category as string,
    brand: r.brand as string, model: r.model as string,
    serialImei: r.serial_imei as string || '', quantity: Number(r.quantity),
    unitPrice: Number(r.unit_price), taxMode: r.tax_mode as SaleItem['taxMode'],
    gstAmount: Number(r.gst_amount), pstAmount: Number(r.pst_amount),
    lineTotal: Number(r.line_total), costPerUnitSnapshot: Number(r.cost_per_unit_snapshot),
    profitAmount: Number(r.profit_amount),
  };
}

function mapReturn(r: Record<string, unknown>): Return {
  return {
    id: r.id as string, returnCode: r.return_code as string,
    sourceTransactionType: r.source_transaction_type as Return['sourceTransactionType'],
    sourceTransactionId: r.source_transaction_id as string,
    sourceItemId: r.source_item_id as string || undefined,
    customerId: r.customer_id as string || undefined,
    employeeId: r.employee_id as string, storeId: r.store_id as string,
    reason: r.reason as string, returnAmount: Number(r.return_amount),
    refundMethod: r.refund_method as Return['refundMethod'],
    status: r.status as Return['status'],
    restockSellable: r.restock_sellable == null ? true : Boolean(r.restock_sellable),
    createdAt: r.created_at as string, completedAt: r.completed_at as string | null,
  };
}

function mapPaymentChange(r: Record<string, unknown>): PaymentChange {
  return {
    id: r.id as string, transactionType: r.transaction_type as PaymentChange['transactionType'],
    transactionId: r.transaction_id as string, transactionRef: r.transaction_ref as string,
    oldPaymentJson: (r.old_payment_json as TransactionPayment[]) || [],
    newPaymentJson: (r.new_payment_json as TransactionPayment[]) || [],
    reason: r.reason as string,
    changedByEmployeeId: r.changed_by_employee_id as string,
    storeId: r.store_id as string, status: r.status as PaymentChange['status'],
    createdAt: r.created_at as string, completedAt: r.completed_at as string | null,
  };
}

function mapPurchaseChange(r: Record<string, unknown>): PurchaseChange {
  return {
    id: r.id as string,
    purchaseTransactionId: r.purchase_transaction_id as string,
    purchaseItemId: r.purchase_item_id as string,
    oldValueJson: (r.old_value_json as Record<string, unknown>) || {},
    newValueJson: (r.new_value_json as Record<string, unknown>) || {},
    reason: r.reason as string,
    changedByEmployeeId: r.changed_by_employee_id as string,
    storeId: r.store_id as string, status: r.status as PurchaseChange['status'],
    createdAt: r.created_at as string, completedAt: r.completed_at as string | null,
  };
}

function mapDrawerEntry(r: Record<string, unknown>): CashDrawerEntry {
  return {
    id: r.id as string, entryCode: r.entry_code as string,
    employeeId: r.employee_id as string, storeId: r.store_id as string,
    entryType: r.entry_type as CashDrawerEntry['entryType'],
    referenceType: r.reference_type as string || undefined,
    referenceId: r.reference_id as string || undefined,
    amount: Number(r.amount), balanceAfter: Number(r.balance_after),
    notes: r.notes as string || '', createdAt: r.created_at as string,
  };
}

function mapAudit(r: Record<string, unknown>): AuditLogEntry {
  return {
    id: r.id as string, actorEmployeeId: r.actor_employee_id as string,
    actorName: r.actor_name as string, module: r.module as string,
    action: r.action as string, recordType: r.record_type as string,
    recordId: r.record_id as string, details: r.details as string,
    createdAt: r.created_at as string,
  };
}

function mapLabel(r: Record<string, unknown>): LabelPrintLog {
  return {
    id: r.id as string, visitId: r.visit_id as string,
    printedByEmployeeId: r.printed_by_employee_id as string,
    printedAt: r.printed_at as string, printCount: Number(r.print_count),
  };
}

function mapShopifyListing(r: Record<string, unknown>): ShopifyListing {
  const base: ShopifyListing = {
    id: r.id as string,
    storeId: r.store_id as string,
    inventoryItemId: r.inventory_item_id as string,
    status: r.status as ShopifyListingStatus,
    title: (r.title as string) || '',
    description: (r.description as string) || '',
    price: Number(r.price) || 0,
    compareAtPrice: r.compare_at_price == null ? null : Number(r.compare_at_price),
    quantity: Number(r.quantity) || 0,
    condition: (r.condition as string) || '',
    shopifyVendor: (r.shopify_vendor as string) || '',
    shopifyProductType: (r.shopify_product_type as string) || '',
    sku: (r.sku as string) || '',
    barcode: (r.barcode as string) || '',
    tags: Array.isArray(r.tags) ? r.tags as string[] : [],
    photos: Array.isArray(r.photos) ? r.photos as ShopifyListingPhoto[] : [],
    attributes: (r.attributes as Record<string, unknown>) || {},
    accessories: Array.isArray(r.accessories) ? r.accessories as ShopifyAccessory[] : [],
    testingResults: (r.testing_results as Record<string, ShopifyTestResult>) || {},
    staffNotes: (r.staff_notes as string) || '',
    extraTitleText: (r.extra_title_text as string) || undefined,
    cosmeticConditionKey: (r.cosmetic_condition as string) || undefined,
    cosmeticConditionNotes: (r.cosmetic_condition_notes as string) || undefined,
    functionalityConditionKey: (r.functionality_condition as string) || undefined,
    functionalityNotes: (r.functionality_notes as string) || undefined,
    descriptionMode: (r.description_mode as 'generated' | 'manual') || undefined,
    includeNotListedWarning: r.include_not_listed_warning == null ? undefined : Boolean(r.include_not_listed_warning),
    originCountry: (r.origin_country as string) || undefined,
    publicNotes: (r.public_notes as string) || undefined,
    titleMode: (r.title_mode as 'generated' | 'manual') || undefined,
    ...fromShopifyCategoryColumns(r),
    shopifyTaxonomyAttributes: Array.isArray((r.attributes as { __taxonomyAttributes?: unknown })?.__taxonomyAttributes)
      ? (r.attributes as { __taxonomyAttributes: ShopifyListing['shopifyTaxonomyAttributes'] }).__taxonomyAttributes
      : undefined,
    shopifyProductId: (r.shopify_product_id as string) || null,
    shopifyVariantId: (r.shopify_variant_id as string) || null,
    shopifyInventoryItemId: (r.shopify_inventory_item_id as string) || null,
    shopifyHandle: (r.shopify_handle as string) || null,
    shopifyUrl: (r.shopify_url as string) || null,
    shopifyAdminUrl: (r.shopify_admin_url as string) || null,
    shopifyStorefrontUrl: (r.shopify_storefront_url as string) || null,
    publishAttempts: Number(r.publish_attempts) || 0,
    lastPublishAttemptAt: (r.last_publish_attempt_at as string) || null,
    publishWarning: (r.publish_warning as string) || null,
    shopifyLocationId: (r.shopify_location_id as string) || null,
    lastError: (r.last_error as string) || null,
    createdByEmployeeId: (r.created_by_employee_id as string) || null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    publishedAt: (r.published_at as string) || null,
    lastSyncedAt: (r.last_synced_at as string) || null,
    endedAt: (r.ended_at as string) || null,
    syncStatus: (r.sync_status as ShopifyListing['syncStatus']) || 'idle',
    lastSyncError: (r.last_sync_error as string) || null,
    lastSyncEventType: (r.last_sync_event_type as string) || null,
  };
  return { ...base, ...getListerMeta(base) };
}

function shopifyListingRow(listing: ShopifyListing): Record<string, unknown> {
  return {
    id: listing.id,
    store_id: listing.storeId,
    inventory_item_id: listing.inventoryItemId,
    status: listing.status,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    compare_at_price: listing.compareAtPrice,
    quantity: listing.quantity,
    condition: listing.condition,
    shopify_vendor: listing.shopifyVendor,
    shopify_product_type: listing.shopifyProductType,
    sku: listing.sku,
    barcode: listing.barcode,
    tags: listing.tags,
    photos: listing.photos,
    attributes: listing.shopifyTaxonomyAttributes
      ? { ...listing.attributes, __taxonomyAttributes: listing.shopifyTaxonomyAttributes }
      : listing.attributes,
    accessories: listing.accessories,
    testing_results: listing.testingResults,
    staff_notes: listing.staffNotes,
    extra_title_text: listing.extraTitleText || '',
    cosmetic_condition: listing.cosmeticConditionKey || '',
    cosmetic_condition_notes: listing.cosmeticConditionNotes || '',
    functionality_condition: listing.functionalityConditionKey || '',
    functionality_notes: listing.functionalityNotes || '',
    description_mode: listing.descriptionMode || 'generated',
    include_not_listed_warning: listing.includeNotListedWarning !== false,
    origin_country: listing.originCountry || '',
    public_notes: listing.publicNotes || '',
    title_mode: listing.titleMode || 'generated',
    ...toShopifyCategoryColumns(listing),
    shopify_product_id: listing.shopifyProductId,
    shopify_variant_id: listing.shopifyVariantId,
    shopify_inventory_item_id: listing.shopifyInventoryItemId,
    shopify_handle: listing.shopifyHandle,
    shopify_url: listing.shopifyUrl,
    shopify_admin_url: listing.shopifyAdminUrl || null,
    shopify_storefront_url: listing.shopifyStorefrontUrl || null,
    publish_attempts: listing.publishAttempts || 0,
    last_publish_attempt_at: listing.lastPublishAttemptAt || null,
    publish_warning: listing.publishWarning || null,
    shopify_location_id: listing.shopifyLocationId || null,
    last_error: listing.lastError,
    created_by_employee_id: listing.createdByEmployeeId,
    created_at: listing.createdAt,
    updated_at: listing.updatedAt,
    published_at: listing.publishedAt,
    last_synced_at: listing.lastSyncedAt,
    ended_at: listing.endedAt,
  };
}

// ═══════════════════════════════════════
// PUBLIC API — organized by domain
// ═══════════════════════════════════════

export const db = {

  // ── Store ──
  async getOrCreateStore(id: string, name: string, address: string, phone: string, gstNumber: string, pstNumber: string) {
    const { data } = await supabase.from('pos_stores').select('*').eq('id', id).maybeSingle();
    if (data) return data;
    await insert('pos_stores', { id, name, address, phone, gst_number: gstNumber, pst_number: pstNumber });
    return { id, name, address, phone, gst_number: gstNumber, pst_number: pstNumber };
  },

  // ── Employees ──
  async getEmployees(storeId: string): Promise<Employee[]> {
    const rows = await query<Record<string, unknown>>('pos_employees', storeId);
    return rows.map(mapEmployee);
  },
  async upsertEmployee(storeId: string, emp: Employee): Promise<boolean> {
    return upsertRow('pos_employees', {
      id: emp.id, store_id: storeId, full_name: emp.fullName, email: emp.email,
      pin: emp.pin, role: emp.role, is_active: emp.isActive, created_at: emp.createdAt,
    });
  },
  async updateEmployee(id: string, updates: Partial<Employee>): Promise<boolean> {
    const mapped: Record<string, unknown> = {};
    if (updates.fullName !== undefined) mapped.full_name = updates.fullName;
    if (updates.email !== undefined) mapped.email = updates.email;
    if (updates.pin !== undefined) mapped.pin = updates.pin;
    if (updates.role !== undefined) mapped.role = updates.role;
    if (updates.isActive !== undefined) mapped.is_active = updates.isActive;
    return update('pos_employees', id, mapped);
  },

  // ── Settings ──
  async getSetting(storeId: string, key: string): Promise<string | null> {
    const { data } = await supabase.from('pos_settings').select('value').eq('store_id', storeId).eq('key', key).maybeSingle();
    return data?.value ?? null;
  },
  async setSetting(storeId: string, key: string, value: string): Promise<void> {
    await supabase.from('pos_settings').upsert(
      { store_id: storeId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'store_id,key' }
    );
  },
  async getAllSettings(storeId: string): Promise<Record<string, string>> {
    const { data } = await supabase.from('pos_settings').select('key,value').eq('store_id', storeId);
    const map: Record<string, string> = {};
    (data || []).forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });
    return map;
  },

  // ── Customers ──
  async getCustomers(storeId: string): Promise<Customer[]> {
    const rows = await query<Record<string, unknown>>('pos_customers', storeId);
    return rows.map(mapCustomer);
  },
  async insertCustomer(storeId: string, c: Customer): Promise<Customer | null> {
    const row = await insert('pos_customers', {
      id: c.id, store_id: storeId, customer_code: c.customerCode,
      id_type: c.idType, id_number: c.idNumber,
      first_name: c.firstName, middle_name: c.middleName, last_name: c.lastName,
      dob: c.dob, address1: c.address1, address2: c.address2,
      city: c.city, province: c.province, postal_code: c.postalCode,
      phone: c.phone, email: c.email, sex: c.sex, race: c.race,
      weight: c.weight, height: c.height, notes: c.notes,
      created_at: c.createdAt, updated_at: c.updatedAt,
    });
    return row ? mapCustomer(row) : null;
  },
  async updateCustomer(id: string, updates: Partial<Customer>): Promise<boolean> {
    const mapped: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.firstName !== undefined) mapped.first_name = updates.firstName;
    if (updates.middleName !== undefined) mapped.middle_name = updates.middleName;
    if (updates.lastName !== undefined) mapped.last_name = updates.lastName;
    if (updates.idType !== undefined) mapped.id_type = updates.idType;
    if (updates.idNumber !== undefined) mapped.id_number = updates.idNumber;
    if (updates.dob !== undefined) mapped.dob = updates.dob;
    if (updates.address1 !== undefined) mapped.address1 = updates.address1;
    if (updates.address2 !== undefined) mapped.address2 = updates.address2;
    if (updates.city !== undefined) mapped.city = updates.city;
    if (updates.province !== undefined) mapped.province = updates.province;
    if (updates.postalCode !== undefined) mapped.postal_code = updates.postalCode;
    if (updates.phone !== undefined) mapped.phone = updates.phone;
    if (updates.email !== undefined) mapped.email = updates.email;
    if (updates.sex !== undefined) mapped.sex = updates.sex;
    if (updates.race !== undefined) mapped.race = updates.race;
    if (updates.weight !== undefined) mapped.weight = updates.weight;
    if (updates.height !== undefined) mapped.height = updates.height;
    if (updates.notes !== undefined) mapped.notes = updates.notes;
    return update('pos_customers', id, mapped);
  },

  // ── Visits ──
  async getVisits(storeId: string): Promise<CustomerVisit[]> {
    const rows = await query<Record<string, unknown>>('pos_visits', storeId);
    return rows.map(mapVisit);
  },
  async insertVisit(storeId: string, v: CustomerVisit): Promise<boolean> {
    return !!await insert('pos_visits', {
      id: v.id, store_id: storeId, visit_code: v.visitCode,
      customer_id: v.customerId, employee_id: v.employeeId,
      visit_type: v.visitType, notes: v.notes,
      created_at: v.createdAt, updated_at: v.updatedAt,
    });
  },

  // ── Purchases ──
  async getPurchases(storeId: string): Promise<PurchaseTransaction[]> {
    const rows = await query<Record<string, unknown>>('pos_purchases', storeId);
    return rows.map(mapPurchase);
  },
  async insertPurchase(storeId: string, p: PurchaseTransaction): Promise<boolean> {
    return !!await insert('pos_purchases', {
      id: p.id, store_id: storeId, visit_id: p.visitId,
      customer_id: p.customerId, employee_id: p.employeeId,
      subtotal: p.subtotal, tax_total: p.taxTotal, total_amount: p.totalAmount,
      notes: p.notes, status: p.status, created_at: p.createdAt,
    });
  },
  async updatePurchase(id: string, updates: Partial<PurchaseTransaction>): Promise<boolean> {
    const mapped: Record<string, unknown> = {};
    if (updates.subtotal !== undefined) mapped.subtotal = updates.subtotal;
    if (updates.totalAmount !== undefined) mapped.total_amount = updates.totalAmount;
    if (updates.status !== undefined) mapped.status = updates.status;
    return update('pos_purchases', id, mapped);
  },

  // ── Purchase Items ──
  async getPurchaseItems(purchaseIds: string[]): Promise<PurchaseItem[]> {
    if (!purchaseIds.length) return [];
    const { data, error } = await supabase.from('pos_purchase_items').select('*').in('purchase_transaction_id', purchaseIds);
    if (error) { console.error('[DB] getPurchaseItems:', error); return []; }
    return (data || []).map(mapPurchaseItem);
  },
  async getAllPurchaseItemsForStore(storeId: string): Promise<PurchaseItem[]> {
    // Get all purchase IDs for store, then get items
    const { data: purchases } = await supabase.from('pos_purchases').select('id').eq('store_id', storeId);
    if (!purchases?.length) return [];
    const ids = purchases.map((p: { id: string }) => p.id);
    return this.getPurchaseItems(ids);
  },
  async insertPurchaseItem(item: PurchaseItem): Promise<boolean> {
    const base = {
      id: item.id, purchase_transaction_id: item.purchaseTransactionId,
      line_number: item.lineNumber, category: item.category,
      brand: item.brand, model: item.model, serial_imei: item.serialImei,
      condition: item.condition, condition_notes: item.conditionNotes,
      inscription: item.inscription, photos: item.photos,
      quantity: item.quantity, buy_price: item.buyPrice,
      estimated_sale_price: item.estimatedSalePrice,
      is_deal: item.isDeal, created_at: item.createdAt,
    };
    const withSpecs = {
      ...base,
      specifications: item.specifications || {},
      listing_title: item.listingTitle || '',
    };
    const saved = await insert('pos_purchase_items', withSpecs);
    if (saved) return true;
    return !!await insert('pos_purchase_items', base);
  },
  async updatePurchaseItem(id: string, updates: Partial<PurchaseItem>): Promise<boolean> {
    const mapped: Record<string, unknown> = {};
    if (updates.photos !== undefined) mapped.photos = updates.photos;
    if (updates.specifications !== undefined) mapped.specifications = updates.specifications;
    if (updates.listingTitle !== undefined) mapped.listing_title = updates.listingTitle;
    if (updates.brand !== undefined) mapped.brand = updates.brand;
    if (updates.model !== undefined) mapped.model = updates.model;
    if (updates.serialImei !== undefined) mapped.serial_imei = updates.serialImei;
    if (updates.category !== undefined) mapped.category = updates.category;
    if (updates.conditionNotes !== undefined) mapped.condition_notes = updates.conditionNotes;
    if (updates.inscription !== undefined) mapped.inscription = updates.inscription;
    if (Object.keys(mapped).length === 0) return true;
    return update('pos_purchase_items', id, mapped);
  },
  async deletePurchaseItem(id: string): Promise<boolean> { return deleteRow('pos_purchase_items', id); },

  // ── Payments (shared) ──
  async getPayments(transactionType: string, transactionIds: string[]): Promise<TransactionPayment[]> {
    if (!transactionIds.length) return [];
    const { data, error } = await supabase.from('pos_payments').select('*')
      .eq('transaction_type', transactionType).in('transaction_id', transactionIds);
    if (error) { console.error('[DB] getPayments:', error); return []; }
    return (data || []).map(mapPayment);
  },
  async getAllPaymentsForType(transactionType: string, storeId: string): Promise<TransactionPayment[]> {
    const table = transactionType === 'purchase' ? 'pos_purchases' : 'pos_sales';
    const { data: txns } = await supabase.from(table).select('id').eq('store_id', storeId);
    if (!txns?.length) return [];
    return this.getPayments(transactionType, txns.map((t: { id: string }) => t.id));
  },
  async insertPayment(p: TransactionPayment): Promise<boolean> {
    return !!await insert('pos_payments', {
      id: p.id, transaction_type: p.transactionType,
      transaction_id: p.transactionId, line_number: p.lineNumber,
      method: p.method, amount: p.amount, reference: p.reference,
      created_at: p.createdAt,
    });
  },
  async deletePayment(id: string): Promise<boolean> { return deleteRow('pos_payments', id); },

  // ── Inventory ──
  async getInventory(storeId: string): Promise<InventoryItem[]> {
    const rows = await query<Record<string, unknown>>('pos_inventory', storeId);
    return rows.map(mapInventory);
  },
  async insertInventory(storeId: string, item: InventoryItem): Promise<boolean> {
    const base = {
      id: item.id, store_id: storeId, device_code: item.deviceCode,
      source_purchase_item_id: item.sourcePurchaseItemId || null,
      visit_id: item.visitId || null,
      category: item.category, brand: item.brand, model: item.model,
      serial_imei: item.serialImei, quantity_on_hand: item.quantityOnHand,
      cost_per_unit: item.costPerUnit, expected_sale_price: item.expectedSalePrice,
      status: item.status, acquired_at: item.acquiredAt, sold_at: item.soldAt,
      notes: item.notes,
    };
    const withSpecs = {
      ...base,
      specifications: item.specifications || {},
      listing_title: item.listingTitle || '',
    };
    const withBarcode = { ...withSpecs, barcode: item.barcode || null };
    const savedBarcode = await insert('pos_inventory', withBarcode);
    if (savedBarcode) return true;
    const saved = await insert('pos_inventory', withSpecs);
    if (saved) return true;
    return !!await insert('pos_inventory', base);
  },
  async updateInventory(id: string, updates: Partial<InventoryItem>): Promise<boolean> {
    const mapped: Record<string, unknown> = {};
    if (updates.deviceCode !== undefined) mapped.device_code = updates.deviceCode;
    if (updates.status !== undefined) mapped.status = updates.status;
    if (updates.soldAt !== undefined) mapped.sold_at = updates.soldAt;
    if (updates.quantityOnHand !== undefined) mapped.quantity_on_hand = updates.quantityOnHand;
    if (updates.expectedSalePrice !== undefined) mapped.expected_sale_price = updates.expectedSalePrice;
    if (updates.costPerUnit !== undefined) mapped.cost_per_unit = updates.costPerUnit;
    if (updates.notes !== undefined) mapped.notes = updates.notes;
    // Storage location
    if (updates.storageLocation !== undefined) mapped.storage_location = updates.storageLocation;
    if (updates.storageRack !== undefined) mapped.storage_rack = updates.storageRack;
    if (updates.storageRow !== undefined) mapped.storage_row = updates.storageRow;
    // Label tracking
    if (updates.labelGenerated !== undefined) mapped.label_generated = updates.labelGenerated;
    if (updates.labelGeneratedAt !== undefined) mapped.label_generated_at = updates.labelGeneratedAt;
    if (updates.labelGeneratedBy !== undefined) mapped.label_generated_by = updates.labelGeneratedBy;
    if (updates.labelPrintCount !== undefined) mapped.label_print_count = updates.labelPrintCount;
    if (updates.lastLabelPrintAt !== undefined) mapped.last_label_print_at = updates.lastLabelPrintAt;
    if (updates.lastLabelPrintBy !== undefined) mapped.last_label_print_by = updates.lastLabelPrintBy;
    if (updates.specifications !== undefined) mapped.specifications = updates.specifications;
    if (updates.listingTitle !== undefined) mapped.listing_title = updates.listingTitle;
    if (updates.category !== undefined) mapped.category = updates.category;
    if (updates.brand !== undefined) mapped.brand = updates.brand;
    if (updates.model !== undefined) mapped.model = updates.model;
    if (updates.serialImei !== undefined) mapped.serial_imei = updates.serialImei;
    if (updates.barcode !== undefined) mapped.barcode = updates.barcode || null;
    if (updates.listingMethod !== undefined) mapped.listing_method = updates.listingMethod || null;
    if (updates.processedAt !== undefined) mapped.processed_at = updates.processedAt || null;
    if (updates.processedByEmployeeId !== undefined) mapped.processed_by_employee_id = updates.processedByEmployeeId || null;
    const ok = await update('pos_inventory', id, mapped);
    if (ok) return true;
    if (mapped.listing_method !== undefined || mapped.processed_at !== undefined || mapped.processed_by_employee_id !== undefined) {
      const fallback = { ...mapped };
      delete fallback.listing_method;
      delete fallback.processed_at;
      delete fallback.processed_by_employee_id;
      return update('pos_inventory', id, fallback);
    }
    return false;
  },

  // ── Location History ──
  async getLocationHistory(itemId: string): Promise<LocationHistoryEntry[]> {
    const { data, error } = await supabase
      .from('pos_location_history')
      .select('*')
      .eq('inventory_item_id', itemId)
      .order('moved_at', { ascending: false });
    if (error) { console.error('[DB] getLocationHistory:', error); return []; }
    return (data || []).map(mapLocationHistory);
  },
  async getAllLocationHistory(storeId: string): Promise<LocationHistoryEntry[]> {
    const rows = await query<Record<string, unknown>>('pos_location_history', storeId, 'moved_at', false);
    return rows.map(mapLocationHistory);
  },
  async insertLocationHistory(storeId: string, entry: LocationHistoryEntry): Promise<boolean> {
    return !!await insert('pos_location_history', {
      id: entry.id, store_id: storeId,
      inventory_item_id: entry.inventoryItemId,
      old_location: entry.oldLocation,
      new_location: entry.newLocation,
      moved_by_employee_id: entry.movedByEmployeeId,
      moved_by_name: entry.movedByName,
      moved_at: entry.movedAt,
      notes: entry.notes,
    });
  },

  // ── Sales ──
  async getSales(storeId: string): Promise<SaleTransaction[]> {
    const rows = await query<Record<string, unknown>>('pos_sales', storeId);
    return rows.map(mapSale);
  },
  async insertSale(storeId: string, s: SaleTransaction): Promise<boolean> {
    const row = {
      id: s.id, store_id: storeId, sale_code: s.saleCode,
      customer_id: s.customerId || null, employee_id: s.employeeId,
      subtotal: s.subtotal, gst_total: s.gstTotal, pst_total: s.pstTotal,
      tax_total: s.taxTotal, total_amount: s.totalAmount,
      sales_channel: s.salesChannel, notes: s.notes, status: s.status,
      created_at: s.createdAt, completed_at: s.completedAt,
      shopify_order_id: s.shopifyOrderId || null,
      shopify_order_name: s.shopifyOrderName || null,
      shopify_customer_name: s.shopifyCustomerName || null,
      shopify_customer_email: s.shopifyCustomerEmail || null,
      shopify_order_url: s.shopifyOrderUrl || null,
    };
    const saved = await insert('pos_sales', row);
    if (saved) return true;
    const fallback = { ...row } as Record<string, unknown>;
    delete fallback.shopify_order_id;
    delete fallback.shopify_order_name;
    delete fallback.shopify_customer_name;
    delete fallback.shopify_customer_email;
    delete fallback.shopify_order_url;
    return !!await insert('pos_sales', fallback);
  },
  async updateSale(id: string, updates: Partial<SaleTransaction>): Promise<boolean> {
    const mapped: Record<string, unknown> = {};
    if (updates.customerId !== undefined) mapped.customer_id = updates.customerId;
    if (updates.subtotal !== undefined) mapped.subtotal = updates.subtotal;
    if (updates.gstTotal !== undefined) mapped.gst_total = updates.gstTotal;
    if (updates.pstTotal !== undefined) mapped.pst_total = updates.pstTotal;
    if (updates.taxTotal !== undefined) mapped.tax_total = updates.taxTotal;
    if (updates.totalAmount !== undefined) mapped.total_amount = updates.totalAmount;
    if (updates.status !== undefined) mapped.status = updates.status;
    if (updates.completedAt !== undefined) mapped.completed_at = updates.completedAt;
    return update('pos_sales', id, mapped);
  },

  // ── Sale Items ──
  async getSaleItems(storeId: string): Promise<SaleItem[]> {
    const { data: sales } = await supabase.from('pos_sales').select('id').eq('store_id', storeId);
    if (!sales?.length) return [];
    const ids = sales.map((s: { id: string }) => s.id);
    const { data, error } = await supabase.from('pos_sale_items').select('*').in('sales_transaction_id', ids);
    if (error) { console.error('[DB] getSaleItems:', error); return []; }
    return (data || []).map(mapSaleItem);
  },
  async insertSaleItem(item: SaleItem): Promise<boolean> {
    return !!await insert('pos_sale_items', {
      id: item.id, sales_transaction_id: item.salesTransactionId,
      inventory_item_id: item.inventoryItemId || null,
      line_number: item.lineNumber, category: item.category,
      brand: item.brand, model: item.model, serial_imei: item.serialImei,
      quantity: item.quantity, unit_price: item.unitPrice,
      tax_mode: item.taxMode, gst_amount: item.gstAmount,
      pst_amount: item.pstAmount, line_total: item.lineTotal,
      cost_per_unit_snapshot: item.costPerUnitSnapshot,
      profit_amount: item.profitAmount,
    });
  },
  async updateSaleItem(id: string, updates: Partial<SaleItem>): Promise<boolean> {
    const mapped: Record<string, unknown> = {};
    if (updates.quantity !== undefined) mapped.quantity = updates.quantity;
    if (updates.unitPrice !== undefined) mapped.unit_price = updates.unitPrice;
    if (updates.taxMode !== undefined) mapped.tax_mode = updates.taxMode;
    if (updates.gstAmount !== undefined) mapped.gst_amount = updates.gstAmount;
    if (updates.pstAmount !== undefined) mapped.pst_amount = updates.pstAmount;
    if (updates.lineTotal !== undefined) mapped.line_total = updates.lineTotal;
    if (updates.profitAmount !== undefined) mapped.profit_amount = updates.profitAmount;
    return update('pos_sale_items', id, mapped);
  },
  async deleteSaleItem(id: string): Promise<boolean> { return deleteRow('pos_sale_items', id); },

  // ── Returns ──
  async getReturns(storeId: string): Promise<Return[]> {
    const rows = await query<Record<string, unknown>>('pos_returns', storeId);
    return rows.map(mapReturn);
  },
  async insertReturn(storeId: string, r: Return): Promise<boolean> {
    const row = {
      id: r.id, store_id: storeId, return_code: r.returnCode,
      source_transaction_type: r.sourceTransactionType,
      source_transaction_id: r.sourceTransactionId,
      source_item_id: r.sourceItemId || null,
      customer_id: r.customerId || null, employee_id: r.employeeId,
      reason: r.reason, return_amount: r.returnAmount,
      refund_method: r.refundMethod, status: r.status,
      restock_sellable: r.restockSellable !== false,
      created_at: r.createdAt, completed_at: r.completedAt,
    };
    const saved = await insert('pos_returns', row);
    if (saved) return true;
    const fallback = { ...row } as Record<string, unknown>;
    delete fallback.restock_sellable;
    return !!await insert('pos_returns', fallback);
  },
  async updateReturn(id: string, updates: Partial<Return>): Promise<boolean> {
    const mapped: Record<string, unknown> = {};
    if (updates.status !== undefined) mapped.status = updates.status;
    if (updates.completedAt !== undefined) mapped.completed_at = updates.completedAt;
    return update('pos_returns', id, mapped);
  },

  // ── Payment Changes ──
  async getPaymentChanges(storeId: string): Promise<PaymentChange[]> {
    const rows = await query<Record<string, unknown>>('pos_payment_changes', storeId);
    return rows.map(mapPaymentChange);
  },
  async insertPaymentChange(storeId: string, pc: PaymentChange): Promise<boolean> {
    return !!await insert('pos_payment_changes', {
      id: pc.id, store_id: storeId, transaction_type: pc.transactionType,
      transaction_id: pc.transactionId, transaction_ref: pc.transactionRef,
      old_payment_json: pc.oldPaymentJson, new_payment_json: pc.newPaymentJson,
      reason: pc.reason, changed_by_employee_id: pc.changedByEmployeeId,
      status: pc.status, created_at: pc.createdAt, completed_at: pc.completedAt,
    });
  },
  async updatePaymentChange(id: string, updates: Partial<PaymentChange>): Promise<boolean> {
    const mapped: Record<string, unknown> = {};
    if (updates.status !== undefined) mapped.status = updates.status;
    if (updates.completedAt !== undefined) mapped.completed_at = updates.completedAt;
    return update('pos_payment_changes', id, mapped);
  },

  // ── Purchase Changes ──
  async getPurchaseChanges(storeId: string): Promise<PurchaseChange[]> {
    const rows = await query<Record<string, unknown>>('pos_purchase_changes', storeId);
    return rows.map(mapPurchaseChange);
  },
  async insertPurchaseChange(storeId: string, pc: PurchaseChange): Promise<boolean> {
    return !!await insert('pos_purchase_changes', {
      id: pc.id, store_id: storeId,
      purchase_transaction_id: pc.purchaseTransactionId,
      purchase_item_id: pc.purchaseItemId,
      old_value_json: pc.oldValueJson, new_value_json: pc.newValueJson,
      reason: pc.reason, changed_by_employee_id: pc.changedByEmployeeId,
      status: pc.status, created_at: pc.createdAt, completed_at: pc.completedAt,
    });
  },
  async updatePurchaseChange(id: string, updates: Partial<PurchaseChange>): Promise<boolean> {
    const mapped: Record<string, unknown> = {};
    if (updates.status !== undefined) mapped.status = updates.status;
    if (updates.completedAt !== undefined) mapped.completed_at = updates.completedAt;
    return update('pos_purchase_changes', id, mapped);
  },

  // ── Cash Drawer ──
  async getCashDrawer(storeId: string) {
    const { data } = await supabase.from('pos_cash_drawer').select('*').eq('store_id', storeId).maybeSingle();
    if (!data) return null;
    return {
      isOpen: data.is_open as boolean,
      openedAt: data.opened_at as string | null,
      openedBy: data.opened_by as string | null,
      openingBalance: Number(data.opening_balance),
      currentBalance: Number(data.current_balance),
    };
  },
  async upsertCashDrawer(storeId: string, drawer: {
    isOpen: boolean; openedAt: string | null; openedBy: string | null;
    openingBalance: number; currentBalance: number;
  }): Promise<boolean> {
    // Use store_id as the conflict key since it has a unique constraint
    const { error } = await supabase.from('pos_cash_drawer').upsert(
      {
        store_id: storeId, is_open: drawer.isOpen,
        opened_at: drawer.openedAt, opened_by: drawer.openedBy,
        opening_balance: drawer.openingBalance,
        current_balance: drawer.currentBalance,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'store_id' }
    );
    if (error) { console.error('[DB] upsertCashDrawer:', error.message); return false; }
    return true;
  },
  async getDrawerEntries(storeId: string): Promise<CashDrawerEntry[]> {
    const rows = await query<Record<string, unknown>>('pos_cash_drawer_entries', storeId, 'created_at', true);
    return rows.map(mapDrawerEntry);
  },
  async insertDrawerEntry(storeId: string, entry: CashDrawerEntry): Promise<boolean> {
    return !!await insert('pos_cash_drawer_entries', {
      id: entry.id, store_id: storeId, entry_code: entry.entryCode,
      employee_id: entry.employeeId, entry_type: entry.entryType,
      reference_type: entry.referenceType || null,
      reference_id: entry.referenceId || null,
      amount: entry.amount, balance_after: entry.balanceAfter,
      notes: entry.notes, created_at: entry.createdAt,
    });
  },

  // ── Audit Log ──
  async getAuditLog(storeId: string): Promise<AuditLogEntry[]> {
    const rows = await query<Record<string, unknown>>('pos_audit_log', storeId);
    return rows.map(mapAudit);
  },
  async insertAudit(storeId: string, entry: AuditLogEntry): Promise<boolean> {
    return !!await insert('pos_audit_log', {
      id: entry.id, store_id: storeId,
      actor_employee_id: entry.actorEmployeeId, actor_name: entry.actorName,
      module: entry.module, action: entry.action,
      record_type: entry.recordType, record_id: entry.recordId,
      details: entry.details, created_at: entry.createdAt,
    });
  },

  // ── Labels ──
  async getLabels(storeId: string): Promise<LabelPrintLog[]> {
    const rows = await query<Record<string, unknown>>('pos_labels', storeId);
    return rows.map(mapLabel);
  },
  async upsertLabel(storeId: string, label: LabelPrintLog): Promise<boolean> {
    return upsertRow('pos_labels', {
      id: label.id, store_id: storeId, visit_id: label.visitId,
      printed_by_employee_id: label.printedByEmployeeId,
      printed_at: label.printedAt, print_count: label.printCount,
    });
  },

  // ── Bulk seed (for initial migration) ──
  async seedCustomers(storeId: string, customers: Customer[]): Promise<number> {
    const rows = customers.map(c => ({
      id: c.id, store_id: storeId, customer_code: c.customerCode,
      id_type: c.idType, id_number: c.idNumber,
      first_name: c.firstName, middle_name: c.middleName, last_name: c.lastName,
      dob: c.dob, address1: c.address1, address2: c.address2,
      city: c.city, province: c.province, postal_code: c.postalCode,
      phone: c.phone, email: c.email, sex: c.sex, race: c.race,
      weight: c.weight, height: c.height, notes: c.notes,
      created_at: c.createdAt, updated_at: c.updatedAt,
    }));
    // Insert in batches of 50
    let count = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await supabase.from('pos_customers').upsert(batch, { onConflict: 'id' });
      if (error) console.error('[DB] seedCustomers batch error:', error.message);
      else count += batch.length;
    }
    return count;
  },

  // ── Shopify Listings ──
  async getShopifyListings(storeId: string): Promise<ShopifyListing[]> {
    const rows = await query<Record<string, unknown>>('pos_shopify_listings', storeId, 'updated_at', false);
    return rows.map(mapShopifyListing);
  },
  async insertShopifyListing(listing: ShopifyListing): Promise<boolean> {
    const row = shopifyListingRow(listing);
    const saved = await insert('pos_shopify_listings', row);
    if (saved) return true;
    const fallback = { ...row };
    delete fallback.shopify_admin_url;
    delete fallback.shopify_storefront_url;
    delete fallback.publish_attempts;
    delete fallback.last_publish_attempt_at;
    delete fallback.publish_warning;
    delete fallback.shopify_location_id;
    delete fallback.extra_title_text;
    delete fallback.cosmetic_condition;
    delete fallback.cosmetic_condition_notes;
    delete fallback.functionality_condition;
    delete fallback.functionality_notes;
    delete fallback.description_mode;
    delete fallback.include_not_listed_warning;
    delete fallback.origin_country;
    delete fallback.public_notes;
    delete fallback.title_mode;
    return !!await insert('pos_shopify_listings', fallback);
  },
  async updateShopifyListing(id: string, updates: Partial<ShopifyListing>): Promise<boolean> {
    const mapped: Record<string, unknown> = { updated_at: updates.updatedAt || new Date().toISOString() };
    if (updates.status !== undefined) mapped.status = updates.status;
    if (updates.title !== undefined) mapped.title = updates.title;
    if (updates.description !== undefined) mapped.description = updates.description;
    if (updates.price !== undefined) mapped.price = updates.price;
    if (updates.compareAtPrice !== undefined) mapped.compare_at_price = updates.compareAtPrice;
    if (updates.quantity !== undefined) mapped.quantity = updates.quantity;
    if (updates.condition !== undefined) mapped.condition = updates.condition;
    if (updates.shopifyVendor !== undefined) mapped.shopify_vendor = updates.shopifyVendor;
    if (updates.shopifyProductType !== undefined) mapped.shopify_product_type = updates.shopifyProductType;
    if (updates.sku !== undefined) mapped.sku = updates.sku;
    if (updates.barcode !== undefined) mapped.barcode = updates.barcode;
    if (updates.tags !== undefined) mapped.tags = updates.tags;
    if (updates.photos !== undefined) mapped.photos = updates.photos;
    if (updates.attributes !== undefined || updates.shopifyTaxonomyAttributes !== undefined) {
      mapped.attributes = {
        ...(updates.attributes || {}),
        ...(updates.shopifyTaxonomyAttributes ? { __taxonomyAttributes: updates.shopifyTaxonomyAttributes } : {}),
      };
    }
    if (updates.accessories !== undefined) mapped.accessories = updates.accessories;
    if (updates.testingResults !== undefined) mapped.testing_results = updates.testingResults;
    if (updates.staffNotes !== undefined) mapped.staff_notes = updates.staffNotes;
    if (updates.extraTitleText !== undefined) mapped.extra_title_text = updates.extraTitleText;
    if (updates.cosmeticConditionKey !== undefined) mapped.cosmetic_condition = updates.cosmeticConditionKey;
    if (updates.cosmeticConditionNotes !== undefined) mapped.cosmetic_condition_notes = updates.cosmeticConditionNotes;
    if (updates.functionalityConditionKey !== undefined) mapped.functionality_condition = updates.functionalityConditionKey;
    if (updates.functionalityNotes !== undefined) mapped.functionality_notes = updates.functionalityNotes;
    if (updates.descriptionMode !== undefined) mapped.description_mode = updates.descriptionMode;
    if (updates.includeNotListedWarning !== undefined) mapped.include_not_listed_warning = updates.includeNotListedWarning;
    if (updates.originCountry !== undefined) mapped.origin_country = updates.originCountry;
    if (updates.publicNotes !== undefined) mapped.public_notes = updates.publicNotes;
    if (updates.titleMode !== undefined) mapped.title_mode = updates.titleMode;
    if (updates.shopifyProductId !== undefined) mapped.shopify_product_id = updates.shopifyProductId;
    if (updates.shopifyVariantId !== undefined) mapped.shopify_variant_id = updates.shopifyVariantId;
    if (updates.shopifyInventoryItemId !== undefined) mapped.shopify_inventory_item_id = updates.shopifyInventoryItemId;
    if (updates.shopifyHandle !== undefined) mapped.shopify_handle = updates.shopifyHandle;
    if (updates.shopifyUrl !== undefined) mapped.shopify_url = updates.shopifyUrl;
    if (updates.shopifyAdminUrl !== undefined) mapped.shopify_admin_url = updates.shopifyAdminUrl;
    if (updates.shopifyStorefrontUrl !== undefined) mapped.shopify_storefront_url = updates.shopifyStorefrontUrl;
    if (updates.publishAttempts !== undefined) mapped.publish_attempts = updates.publishAttempts;
    if (updates.lastPublishAttemptAt !== undefined) mapped.last_publish_attempt_at = updates.lastPublishAttemptAt;
    if (updates.publishWarning !== undefined) mapped.publish_warning = updates.publishWarning;
    if (updates.shopifyLocationId !== undefined) mapped.shopify_location_id = updates.shopifyLocationId;
    if (updates.lastError !== undefined) mapped.last_error = updates.lastError;
    if (updates.publishedAt !== undefined) mapped.published_at = updates.publishedAt;
    if (updates.lastSyncedAt !== undefined) mapped.last_synced_at = updates.lastSyncedAt;
    if (updates.endedAt !== undefined) mapped.ended_at = updates.endedAt;
    if (updates.syncStatus !== undefined) mapped.sync_status = updates.syncStatus;
    if (updates.lastSyncError !== undefined) mapped.last_sync_error = updates.lastSyncError;
    if (updates.lastSyncEventType !== undefined) mapped.last_sync_event_type = updates.lastSyncEventType;
    const saved = await update('pos_shopify_listings', id, mapped);
    if (saved) return true;
    const fallback = { ...mapped };
    delete fallback.extra_title_text;
    delete fallback.cosmetic_condition;
    delete fallback.cosmetic_condition_notes;
    delete fallback.functionality_condition;
    delete fallback.functionality_notes;
    delete fallback.description_mode;
    delete fallback.include_not_listed_warning;
    delete fallback.origin_country;
    delete fallback.public_notes;
    delete fallback.title_mode;
    delete fallback.shopify_admin_url;
    delete fallback.shopify_storefront_url;
    delete fallback.publish_attempts;
    delete fallback.last_publish_attempt_at;
    delete fallback.publish_warning;
    delete fallback.shopify_location_id;
    delete fallback.sync_status;
    delete fallback.last_sync_error;
    delete fallback.last_sync_event_type;
    return update('pos_shopify_listings', id, fallback);
  },

  async getShopifyListing(id: string): Promise<ShopifyListing | null> {
    const { data, error } = await supabase.from('pos_shopify_listings').select('*').eq('id', id).maybeSingle();
    if (error) {
      console.error('[DB] getShopifyListing:', error.message);
      return null;
    }
    return data ? mapShopifyListing(data as Record<string, unknown>) : null;
  },

  async saveShopifyListingCategory(
    id: string,
    fields: {
      shopifyCategoryId: string | null;
      shopifyCategoryName: string | null;
      shopifyCategoryFullName: string | null;
      shopifyCategoryConfirmed: boolean;
    },
  ): Promise<{ listing: ShopifyListing | null; error?: string }> {
    const mapped = {
      ...toShopifyCategoryColumns(fields),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('pos_shopify_listings')
      .update(mapped)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) {
      console.error('[DB] saveShopifyListingCategory:', error.message);
      return { listing: null, error: 'Could not save Shopify category.' };
    }
    const listing = data
      ? mapShopifyListing(data as Record<string, unknown>)
      : await db.getShopifyListing(id);
    if (!listing) {
      console.error('[DB] saveShopifyListingCategory: no row returned after update');
      return { listing: null, error: 'Could not save Shopify category.' };
    }
    return { listing };
  },

  async seedInventory(storeId: string, items: InventoryItem[]): Promise<number> {
    const rows = items.map(i => ({
      id: i.id, store_id: storeId, device_code: i.deviceCode,
      source_purchase_item_id: i.sourcePurchaseItemId || null,
      visit_id: i.visitId || null,
      category: i.category, brand: i.brand, model: i.model,
      serial_imei: i.serialImei, quantity_on_hand: i.quantityOnHand,
      cost_per_unit: i.costPerUnit, expected_sale_price: i.expectedSalePrice,
      status: i.status, acquired_at: i.acquiredAt, sold_at: i.soldAt,
      notes: i.notes,
    }));
    let count = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await supabase.from('pos_inventory').upsert(batch, { onConflict: 'id' });
      if (error) console.error('[DB] seedInventory batch error:', error.message);
      else count += batch.length;
    }
    return count;
  },

  async sellInventoryAtomic(inventoryId: string, quantity: number, soldAt: string): Promise<{
    quantityOnHand: number;
    status: InventoryItem['status'];
    soldAt: string | null;
    fullySold: boolean;
  } | null> {
    const { data, error } = await supabase.rpc('pos_sell_inventory_atomic', {
      p_inventory_id: inventoryId,
      p_quantity: quantity,
      p_sold_at: soldAt,
    });
    if (error || !data) {
      console.error('[DB] sellInventoryAtomic:', error?.message);
      return null;
    }
    const row = data as { quantity_on_hand: number; status: string; sold_at: string | null; fully_sold: boolean };
    return {
      quantityOnHand: Number(row.quantity_on_hand),
      status: row.status as InventoryItem['status'],
      soldAt: row.sold_at,
      fullySold: Boolean(row.fully_sold),
    };
  },

  async restoreInventoryAtomic(
    inventoryId: string,
    quantity: number,
    targetStatus: string,
    sellable = true,
  ): Promise<{ quantityOnHand: number; status: InventoryItem['status']; restocked: boolean } | null> {
    const { data, error } = await supabase.rpc('pos_restore_inventory_atomic', {
      p_inventory_id: inventoryId,
      p_quantity: quantity,
      p_target_status: targetStatus,
      p_sellable: sellable,
    });
    if (error || !data) {
      console.error('[DB] restoreInventoryAtomic:', error?.message);
      return null;
    }
    const row = data as { quantity_on_hand: number; status: string; restocked: boolean };
    return {
      quantityOnHand: Number(row.quantity_on_hand),
      status: row.status as InventoryItem['status'],
      restocked: Boolean(row.restocked),
    };
  },

  async getShopifySyncEvents(storeId: string) {
    const { data, error } = await supabase
      .from('pos_shopify_sync_events')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('[DB] getShopifySyncEvents:', error.message);
      return [];
    }
    return data || [];
  },
};
