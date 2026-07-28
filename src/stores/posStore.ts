/**
 * POS Store — Database-backed with Zustand as in-memory cache.
 * NO localStorage persistence. All mutations write to database.
 * Data loaded from DB on app startup per store.
 */

import { create } from 'zustand';
import type {
  Customer, CustomerVisit, PurchaseTransaction, PurchaseItem,
  TransactionPayment, InventoryItem, SaleTransaction, SaleItem,
  Return, PaymentChange, PurchaseChange, CashDrawerState, CashDrawerEntry,
  AuditLogEntry, LabelPrintLog, TaxMode, PaymentMethod, SalesChannel,
  DeviceCondition, InventoryStatus, IdType, LocationHistoryEntry,
} from '@/types';
import { calculateLineTax, generateId, generateCode, generateDeviceCode, setNextDeviceNumber, getStoreDeviceCodePrefix, parseDeviceCodeNumber, generateCustomerCode, round2 } from '@/lib/taxCalc';
import { db } from '@/lib/database';
import { useEbayStore } from '@/stores/ebayStore';
import { PROD_SETTINGS } from '@/constants/migrationData';
import { STORE_ID } from '@/constants/mockData';

interface PosState {
  // Loading
  isLoading: boolean;
  isLoaded: boolean;
  activeStoreId: string | null;

  // Data
  customers: Customer[];
  visits: CustomerVisit[];
  purchases: PurchaseTransaction[];
  purchaseItems: PurchaseItem[];
  purchasePayments: TransactionPayment[];
  inventory: InventoryItem[];
  sales: SaleTransaction[];
  saleItems: SaleItem[];
  salePayments: TransactionPayment[];
  returns: Return[];
  paymentChanges: PaymentChange[];
  purchaseChanges: PurchaseChange[];
  cashDrawer: CashDrawerState;
  auditLog: AuditLogEntry[];
  labels: LabelPrintLog[];
  nextVisitNumber: number;

  // Init
  loadStoreData: (storeId: string) => Promise<void>;

  // Customer
  addCustomer: (data: Omit<Customer, 'id' | 'customerCode' | 'createdAt' | 'updatedAt'>) => string;
  updateCustomer: (id: string, data: Partial<Customer>) => void;

  // Visit
  createVisit: (customerId: string, employeeId: string, storeId: string, visitType: CustomerVisit['visitType'], notes?: string) => string;

  // Purchase
  createPurchase: (visitId: string, customerId: string, employeeId: string, storeId: string) => string;
  addPurchaseItem: (purchaseId: string, item: Omit<PurchaseItem, 'id' | 'purchaseTransactionId' | 'lineNumber' | 'createdAt'>) => string;
  removePurchaseItem: (purchaseId: string, itemId: string) => void;
  addPurchasePayment: (purchaseId: string, method: PaymentMethod, amount: number, reference?: string) => void;
  removePurchasePayment: (paymentId: string) => void;
  completePurchase: (purchaseId: string, employeeName: string, storeId: string) => void;

  // Inventory
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'deviceCode' | 'acquiredAt' | 'soldAt' | 'storageLocation' | 'storageRack' | 'storageRow' | 'labelGenerated' | 'labelGeneratedAt' | 'labelGeneratedBy' | 'labelPrintCount' | 'lastLabelPrintAt' | 'lastLabelPrintBy'> & Partial<Pick<InventoryItem, 'storageLocation' | 'storageRack' | 'storageRow' | 'labelGenerated'>>) => string;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => void;

  // Inventory Location & Labels
  assignInventoryLocation: (itemId: string, location: string, rack: string, row: string, employeeId: string, employeeName: string, notes?: string) => Promise<void>;
  generateInventoryLabel: (itemId: string, employeeId: string, employeeName: string) => Promise<void>;
  recordInventoryLabelPrint: (itemId: string, employeeId: string, employeeName: string) => Promise<void>;
  getInventoryLocationHistory: (itemId: string) => Promise<LocationHistoryEntry[]>;

  // Sales
  createSale: (employeeId: string, storeId: string, channel?: SalesChannel, customerId?: string) => string;
  setSaleCustomer: (saleId: string, customerId: string | undefined) => void;
  addSaleItem: (saleId: string, item: Omit<SaleItem, 'id' | 'salesTransactionId' | 'lineNumber' | 'gstAmount' | 'pstAmount' | 'lineTotal' | 'profitAmount'>) => void;
  updateSaleItem: (saleId: string, itemId: string, updates: Partial<SaleItem>) => void;
  removeSaleItem: (saleId: string, itemId: string) => void;
  addSalePayment: (saleId: string, method: PaymentMethod, amount: number, reference?: string) => void;
  removeSalePayment: (paymentId: string) => void;
  completeSale: (saleId: string, employeeName: string) => void;
  voidSale: (saleId: string) => void;

  // Returns
  createReturn: (data: Omit<Return, 'id' | 'returnCode' | 'createdAt' | 'completedAt' | 'status'>) => string;
  completeReturn: (returnId: string, employeeName: string) => void;

  // Payment Changes
  createPaymentChange: (data: Omit<PaymentChange, 'id' | 'createdAt' | 'completedAt' | 'status'>) => string;
  completePaymentChange: (changeId: string, employeeName: string) => void;

  // Purchase Changes
  createPurchaseChange: (data: Omit<PurchaseChange, 'id' | 'createdAt' | 'completedAt' | 'status'>) => string;
  completePurchaseChange: (changeId: string, employeeName: string) => void;

  // Void Purchase
  voidPurchase: (purchaseId: string, reason: string, employeeId: string, employeeName: string) => void;

  // Cash Drawer
  openDrawer: (amount: number, employeeId: string, storeId: string, employeeName: string) => void;
  closeDrawer: (employeeId: string, storeId: string, employeeName: string) => void;
  addDrawerEntry: (type: CashDrawerEntry['entryType'], amount: number, notes: string, employeeId: string, storeId: string, refType?: string, refId?: string) => void;

  // Labels
  printLabel: (visitId: string, employeeId: string) => void;

  // Audit
  logAction: (actorId: string, actorName: string, module: string, action: string, recordType: string, recordId: string, details: string) => void;

  // Polling
  refreshCashDrawer: () => Promise<void>;

  // Reset
  resetAll: () => void;
}

const emptyDrawer: CashDrawerState = {
  isOpen: false, openedAt: null, openedBy: null,
  openingBalance: 0, currentBalance: 0, entries: [],
};

function recalcSaleItem(item: SaleItem): SaleItem {
  const sub = round2(item.quantity * item.unitPrice);
  const { gst, pst, total } = calculateLineTax(sub, item.taxMode);
  const profit = round2(sub - (item.costPerUnitSnapshot * item.quantity));
  return { ...item, gstAmount: gst, pstAmount: pst, lineTotal: total, profitAmount: profit };
}

function recalcSale(sale: SaleTransaction, items: SaleItem[]): { sale: SaleTransaction; items: SaleItem[] } {
  const recalced = items.map(recalcSaleItem);
  const subtotal = round2(recalced.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
  const gstTotal = round2(recalced.reduce((s, i) => s + i.gstAmount, 0));
  const pstTotal = round2(recalced.reduce((s, i) => s + i.pstAmount, 0));
  const taxTotal = round2(gstTotal + pstTotal);
  return {
    sale: { ...sale, subtotal, gstTotal, pstTotal, taxTotal, totalAmount: round2(subtotal + taxTotal) },
    items: recalced,
  };
}

export const usePosStore = create<PosState>()(
  (set, get) => ({
    isLoading: false,
    isLoaded: false,
    activeStoreId: null,
    customers: [],
    visits: [],
    purchases: [],
    purchaseItems: [],
    purchasePayments: [],
    inventory: [],
    sales: [],
    saleItems: [],
    salePayments: [],
    returns: [],
    paymentChanges: [],
    purchaseChanges: [],
    cashDrawer: emptyDrawer,
    auditLog: [],
    labels: [],
    nextVisitNumber: PROD_SETTINGS.nextVisitNumber,

    // ── Load all store data from DB ──
    loadStoreData: async (storeId: string) => {
      set({ isLoading: true });
      console.log(`[POS] Loading data for store ${storeId}...`);

      try {
        // Ensure single-store record exists (PayMore Vancouver — data imported via CSV)
        await db.getOrCreateStore(
          STORE_ID,
          'PayMore Vancouver',
          '4534 Main St, Vancouver, BC',
          '(604) 555-0202',
          'GST-827461954',
          'PST-103847262',
        );

        // Load all data in parallel
        const [
          customers, visits, purchases, inventory, sales,
          returns, paymentChanges, purchaseChanges,
          drawerData, drawerEntries, auditLog, labels, allSettings,
        ] = await Promise.all([
          db.getCustomers(storeId),
          db.getVisits(storeId),
          db.getPurchases(storeId),
          db.getInventory(storeId),
          db.getSales(storeId),
          db.getReturns(storeId),
          db.getPaymentChanges(storeId),
          db.getPurchaseChanges(storeId),
          db.getCashDrawer(storeId),
          db.getDrawerEntries(storeId),
          db.getAuditLog(storeId),
          db.getLabels(storeId),
          db.getAllSettings(storeId),
        ]);

        // Load items/payments that depend on parent IDs
        const purchaseIds = purchases.map(p => p.id);
        const saleIds = sales.map(s => s.id);
        const [purchaseItems, purchasePayments, saleItems, salePayments] = await Promise.all([
          db.getPurchaseItems(purchaseIds),
          db.getPayments('purchase', purchaseIds),
          saleIds.length ? db.getSaleItems(storeId) : Promise.resolve([]),
          db.getPayments('sale', saleIds),
        ]);

        const nextVisitNum = parseInt(allSettings['next_visit_number'] || String(PROD_SETTINGS.nextVisitNumber));

        // ── ONE-TIME MIGRATION: Convert legacy DEV-XXXXX codes to store-specific format ──
        // STR-001 (Vancouver): BC05-XXXXXX (6-digit padded)
        const legacyItems = inventory.filter((i) => i.deviceCode.startsWith('DEV-'));
        if (legacyItems.length > 0) {
          const prefix = getStoreDeviceCodePrefix(storeId);
          console.log(`[POS] Migrating ${legacyItems.length} legacy device codes → ${prefix}- format...`);
          await Promise.all(legacyItems.map(async (item) => {
            const n = parseDeviceCodeNumber(item.deviceCode);
            const newCode = `${prefix}-${String(n).padStart(6, '0')}`;
            await db.updateInventory(item.id, { deviceCode: newCode });
            item.deviceCode = newCode;
          }));
          console.log(`[POS] Device code migration complete — all labels will regenerate with new format on next print`);
        }

        // Compute next device number from highest current code for this store
        const maxNum = inventory.reduce((max, i) => {
          const n = parseDeviceCodeNumber(i.deviceCode);
          return n > max ? n : max;
        }, 0);
        const nextDeviceNum = Math.max(
          parseInt(allSettings['next_device_number'] || String(PROD_SETTINGS.nextDeviceNumber)),
          maxNum + 1
        );
        setNextDeviceNumber(storeId, nextDeviceNum);
        // Persist updated next_device_number
        if (legacyItems.length > 0 || String(nextDeviceNum) !== allSettings['next_device_number']) {
          await db.setSetting(storeId, 'next_device_number', String(nextDeviceNum));
        }

        const drawer: CashDrawerState = drawerData
          ? { ...drawerData, entries: drawerEntries }
          : emptyDrawer;

        set({
          isLoading: false,
          isLoaded: true,
          activeStoreId: storeId,
          customers, visits, purchases, purchaseItems, purchasePayments,
          inventory, sales, saleItems, salePayments,
          returns, paymentChanges, purchaseChanges,
          cashDrawer: drawer, auditLog, labels,
          nextVisitNumber: nextVisitNum,
        });

        console.log(`[POS] Loaded: ${customers.length} customers, ${inventory.length} inventory, ${sales.length} sales`);
      } catch (err) {
        console.error('[POS] Load error:', err);
        set({ isLoading: false });
      }
    },

    // ── Customer ──
    addCustomer: (data) => {
      const id = generateId('CUS');
      const now = new Date().toISOString();
      const customer: Customer = { ...data, id, customerCode: generateCustomerCode(), createdAt: now, updatedAt: now };
      set((s) => ({ customers: [customer, ...s.customers] }));
      const storeId = get().activeStoreId;
      if (storeId) db.insertCustomer(storeId, customer);
      return id;
    },
    updateCustomer: (id, data) => {
      set((s) => ({ customers: s.customers.map((c) => c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c) }));
      db.updateCustomer(id, data);
    },

    // ── Visit ──
    createVisit: (customerId, employeeId, storeId, visitType, notes = '') => {
      const id = generateId('VIS');
      const now = new Date().toISOString();
      const num = get().nextVisitNumber;
      const prefix = 'BC-02';
      const visitCode = `${prefix}-${num}`;
      const visit: CustomerVisit = { id, visitCode, customerId, employeeId, visitType, notes, createdAt: now, updatedAt: now };
      set((s) => ({ visits: [visit, ...s.visits], nextVisitNumber: s.nextVisitNumber + 1 }));
      db.insertVisit(storeId, visit);
      db.setSetting(storeId, 'next_visit_number', String(num + 1));
      return id;
    },

    // ── Purchase ──
    createPurchase: (visitId, customerId, employeeId, storeId) => {
      const id = generateId('PUR');
      const purchase: PurchaseTransaction = { id, visitId, customerId, employeeId, storeId, subtotal: 0, taxTotal: 0, totalAmount: 0, notes: '', status: 'draft', createdAt: new Date().toISOString() };
      set((s) => ({ purchases: [purchase, ...s.purchases] }));
      db.insertPurchase(storeId, purchase);
      return id;
    },
    addPurchaseItem: (purchaseId, item) => {
      const id = generateId('PI');
      const existing = get().purchaseItems.filter((i) => i.purchaseTransactionId === purchaseId);
      const pi: PurchaseItem = { ...item, id, purchaseTransactionId: purchaseId, lineNumber: existing.length + 1, createdAt: new Date().toISOString() };
      set((s) => {
        const newItems = [...s.purchaseItems, pi];
        const purchItems = newItems.filter((i) => i.purchaseTransactionId === purchaseId);
        const subtotal = round2(purchItems.reduce((sum, i) => sum + i.buyPrice * i.quantity, 0));
        return {
          purchaseItems: newItems,
          purchases: s.purchases.map((p) => p.id === purchaseId ? { ...p, subtotal, totalAmount: subtotal } : p),
        };
      });
      db.insertPurchaseItem(pi);
      // Update purchase totals
      const purchItems = get().purchaseItems.filter((i) => i.purchaseTransactionId === purchaseId);
      const subtotal = round2(purchItems.reduce((sum, i) => sum + i.buyPrice * i.quantity, 0));
      db.updatePurchase(purchaseId, { subtotal, totalAmount: subtotal });
      return id;
    },
    removePurchaseItem: (purchaseId, itemId) => {
      set((s) => {
        const newItems = s.purchaseItems.filter((i) => i.id !== itemId);
        const purchItems = newItems.filter((i) => i.purchaseTransactionId === purchaseId);
        const subtotal = round2(purchItems.reduce((sum, i) => sum + i.buyPrice * i.quantity, 0));
        return {
          purchaseItems: newItems,
          purchases: s.purchases.map((p) => p.id === purchaseId ? { ...p, subtotal, totalAmount: subtotal } : p),
        };
      });
      db.deletePurchaseItem(itemId);
      const purchItems = get().purchaseItems.filter((i) => i.purchaseTransactionId === purchaseId);
      const subtotal = round2(purchItems.reduce((sum, i) => sum + i.buyPrice * i.quantity, 0));
      db.updatePurchase(purchaseId, { subtotal, totalAmount: subtotal });
    },
    addPurchasePayment: (purchaseId, method, amount, reference = '') => {
      const id = generateId('PP');
      const existing = get().purchasePayments.filter((p) => p.transactionId === purchaseId);
      const payment: TransactionPayment = { id, transactionType: 'purchase', transactionId: purchaseId, lineNumber: existing.length + 1, method, amount, reference, createdAt: new Date().toISOString() };
      set((s) => ({ purchasePayments: [...s.purchasePayments, payment] }));
      db.insertPayment(payment);
    },
    removePurchasePayment: (paymentId) => {
      set((s) => ({ purchasePayments: s.purchasePayments.filter((p) => p.id !== paymentId) }));
      db.deletePayment(paymentId);
    },
    completePurchase: (purchaseId, employeeName, storeId) => {
      const state = get();
      const purchase = state.purchases.find((p) => p.id === purchaseId);
      if (!purchase) return;
      const items = state.purchaseItems.filter((i) => i.purchaseTransactionId === purchaseId);
      const payments = state.purchasePayments.filter((p) => p.transactionId === purchaseId);

      set((s) => ({ purchases: s.purchases.map((p) => p.id === purchaseId ? { ...p, status: 'completed' as const } : p) }));
      db.updatePurchase(purchaseId, { status: 'completed' });

      // Create inventory for deal items
      items.filter((item) => item.isDeal).forEach((item) => {
        get().addInventoryItem({
          sourcePurchaseItemId: item.id, visitId: purchase.visitId,
          category: item.category, brand: item.brand, model: item.model,
          serialImei: item.serialImei, quantityOnHand: item.quantity,
          costPerUnit: item.buyPrice, expectedSalePrice: item.estimatedSalePrice || 0,
          status: 'available', storeId, notes: item.conditionNotes,
        });
      });

      // Cash drawer — only CASH payments
      const cashTotal = round2(payments.filter((p) => p.method === 'cash').reduce((s2, p) => s2 + p.amount, 0));
      if (cashTotal > 0) {
        get().addDrawerEntry('purchase', -cashTotal, `Purchase ${purchaseId} — Cash payout`, purchase.employeeId, storeId, 'purchase', purchaseId);
      }

      get().logAction(purchase.employeeId, employeeName, 'Purchases', 'PURCHASE_COMPLETE', 'purchase', purchaseId,
        `Purchase completed — ${items.length} items — $${purchase.totalAmount.toFixed(2)}`);
    },

    // ── Inventory ──
    addInventoryItem: (item) => {
      const id = generateId('INV');
      const storeId = get().activeStoreId;
      if (!storeId) {
        console.error('[POS] Cannot add inventory: no active store');
        return id;
      }
      const deviceCode = generateDeviceCode(storeId);
      const inv: InventoryItem = {
        ...item,
        id, deviceCode,
        acquiredAt: new Date().toISOString(),
        soldAt: null,
        storageLocation: item.storageLocation ?? null,
        storageRack: item.storageRack ?? null,
        storageRow: item.storageRow ?? null,
        labelGenerated: item.labelGenerated ?? false,
        labelGeneratedAt: null,
        labelGeneratedBy: null,
        labelPrintCount: 0,
        lastLabelPrintAt: null,
        lastLabelPrintBy: null,
      };
      set((s) => ({ inventory: [inv, ...s.inventory] }));
      db.insertInventory(storeId, inv);
      // Persist next device number for this store
      const nextNum = parseDeviceCodeNumber(deviceCode) + 1;
      db.setSetting(storeId, 'next_device_number', String(nextNum));
      return id;
    },
    updateInventoryItem: (id, updates) => {
      set((s) => ({ inventory: s.inventory.map((i) => i.id === id ? { ...i, ...updates } : i) }));
      db.updateInventory(id, updates);
    },

    // ── Inventory: Storage Location ──
    assignInventoryLocation: async (itemId, location, rack, row, employeeId, employeeName, notes = '') => {
      const state = get();
      const item = state.inventory.find((i) => i.id === itemId);
      if (!item) return;
      const storeId = state.activeStoreId;
      if (!storeId) return;
      const oldLocation = item.storageLocation;
      const updates: Partial<InventoryItem> = {
        storageLocation: location,
        storageRack: rack,
        storageRow: row,
      };
      set((s) => ({ inventory: s.inventory.map((i) => i.id === itemId ? { ...i, ...updates } : i) }));
      await db.updateInventory(itemId, updates);
      // Record location history
      const historyEntry: LocationHistoryEntry = {
        id: generateId('LOC'),
        storeId,
        inventoryItemId: itemId,
        oldLocation,
        newLocation: location,
        movedByEmployeeId: employeeId,
        movedByName: employeeName,
        movedAt: new Date().toISOString(),
        notes,
      };
      db.insertLocationHistory(storeId, historyEntry);
      // Audit log
      get().logAction(
        employeeId, employeeName, 'Inventory',
        oldLocation ? 'LOCATION_MOVE' : 'LOCATION_ASSIGN',
        'inventory', itemId,
        `${item.brand} ${item.model} (${item.deviceCode}) — ${oldLocation ? `moved from ${oldLocation} to ${location}` : `assigned to ${location}`}${notes ? ` — ${notes}` : ''}`
      );
    },

    // ── Inventory: Label Generation ──
    generateInventoryLabel: async (itemId, employeeId, employeeName) => {
      const state = get();
      const item = state.inventory.find((i) => i.id === itemId);
      if (!item) return;
      const now = new Date().toISOString();
      const wasGenerated = item.labelGenerated;
      const updates: Partial<InventoryItem> = {
        labelGenerated: true,
        labelGeneratedAt: now,
        labelGeneratedBy: employeeName,
      };
      set((s) => ({ inventory: s.inventory.map((i) => i.id === itemId ? { ...i, ...updates } : i) }));
      await db.updateInventory(itemId, updates);
      get().logAction(
        employeeId, employeeName, 'Inventory',
        wasGenerated ? 'LABEL_REGENERATE' : 'LABEL_GENERATE',
        'inventory', itemId,
        `${wasGenerated ? 'Regenerated' : 'Generated'} label for ${item.brand} ${item.model} (${item.deviceCode})`
      );
    },

    // ── Inventory: Record Label Print ──
    recordInventoryLabelPrint: async (itemId, employeeId, employeeName) => {
      const state = get();
      const item = state.inventory.find((i) => i.id === itemId);
      if (!item) return;
      const now = new Date().toISOString();
      const newCount = (item.labelPrintCount || 0) + 1;
      const updates: Partial<InventoryItem> = {
        labelPrintCount: newCount,
        lastLabelPrintAt: now,
        lastLabelPrintBy: employeeName,
      };
      set((s) => ({ inventory: s.inventory.map((i) => i.id === itemId ? { ...i, ...updates } : i) }));
      await db.updateInventory(itemId, updates);
      // Don't log every print individually — count is tracked on the item
    },

    // ── Inventory: Location History ──
    getInventoryLocationHistory: async (itemId) => {
      return db.getLocationHistory(itemId);
    },

    // ── Sales ──
    createSale: (employeeId, storeId, channel = 'in-store', customerId) => {
      const id = generateId('SAL');
      const sale: SaleTransaction = { id, saleCode: generateCode('S'), customerId, employeeId, storeId, subtotal: 0, gstTotal: 0, pstTotal: 0, taxTotal: 0, totalAmount: 0, salesChannel: channel, notes: '', status: 'draft', createdAt: new Date().toISOString(), completedAt: null };
      set((s) => ({ sales: [sale, ...s.sales] }));
      db.insertSale(storeId, sale);
      return id;
    },
    setSaleCustomer: (saleId, customerId) => {
      set((s) => ({ sales: s.sales.map((sl) => sl.id === saleId ? { ...sl, customerId } : sl) }));
      db.updateSale(saleId, { customerId });
    },
    addSaleItem: (saleId, item) => {
      const existing = get().saleItems.filter((i) => i.salesTransactionId === saleId);
      const si: SaleItem = { ...item, id: generateId('SI'), salesTransactionId: saleId, lineNumber: existing.length + 1, gstAmount: 0, pstAmount: 0, lineTotal: 0, profitAmount: 0 };
      set((s) => {
        const newItems = [...s.saleItems, si];
        const saleItemsForSale = newItems.filter((i) => i.salesTransactionId === saleId);
        const sale = s.sales.find((sl) => sl.id === saleId);
        if (!sale) return { saleItems: newItems };
        const { sale: updatedSale, items: updatedItems } = recalcSale(sale, saleItemsForSale);
        const otherItems = newItems.filter((i) => i.salesTransactionId !== saleId);
        return { sales: s.sales.map((sl) => sl.id === saleId ? updatedSale : sl), saleItems: [...otherItems, ...updatedItems] };
      });
      // Persist recalculated data
      const recalcedItem = recalcSaleItem(si);
      db.insertSaleItem(recalcedItem);
      const sale = get().sales.find((sl) => sl.id === saleId);
      if (sale) db.updateSale(saleId, { subtotal: sale.subtotal, gstTotal: sale.gstTotal, pstTotal: sale.pstTotal, taxTotal: sale.taxTotal, totalAmount: sale.totalAmount });
    },
    updateSaleItem: (saleId, itemId, updates) => {
      set((s) => {
        const newItems = s.saleItems.map((i) => i.id === itemId ? { ...i, ...updates } : i);
        const saleItemsForSale = newItems.filter((i) => i.salesTransactionId === saleId);
        const sale = s.sales.find((sl) => sl.id === saleId);
        if (!sale) return { saleItems: newItems };
        const { sale: updatedSale, items: updatedItems } = recalcSale(sale, saleItemsForSale);
        const otherItems = newItems.filter((i) => i.salesTransactionId !== saleId);
        return { sales: s.sales.map((sl) => sl.id === saleId ? updatedSale : sl), saleItems: [...otherItems, ...updatedItems] };
      });
      // Persist updated item + sale totals
      const updatedItem = get().saleItems.find(i => i.id === itemId);
      if (updatedItem) db.updateSaleItem(itemId, updatedItem);
      const sale = get().sales.find((sl) => sl.id === saleId);
      if (sale) db.updateSale(saleId, { subtotal: sale.subtotal, gstTotal: sale.gstTotal, pstTotal: sale.pstTotal, taxTotal: sale.taxTotal, totalAmount: sale.totalAmount });
    },
    removeSaleItem: (saleId, itemId) => {
      set((s) => {
        const newItems = s.saleItems.filter((i) => i.id !== itemId);
        const saleItemsForSale = newItems.filter((i) => i.salesTransactionId === saleId);
        const sale = s.sales.find((sl) => sl.id === saleId);
        if (!sale) return { saleItems: newItems };
        const { sale: updatedSale, items: updatedItems } = recalcSale(sale, saleItemsForSale);
        const otherItems = newItems.filter((i) => i.salesTransactionId !== saleId);
        return { sales: s.sales.map((sl) => sl.id === saleId ? updatedSale : sl), saleItems: [...otherItems, ...updatedItems] };
      });
      db.deleteSaleItem(itemId);
      const sale = get().sales.find((sl) => sl.id === saleId);
      if (sale) db.updateSale(saleId, { subtotal: sale.subtotal, gstTotal: sale.gstTotal, pstTotal: sale.pstTotal, taxTotal: sale.taxTotal, totalAmount: sale.totalAmount });
    },
    addSalePayment: (saleId, method, amount, reference = '') => {
      const id = generateId('SP');
      const existing = get().salePayments.filter((p) => p.transactionId === saleId);
      const payment: TransactionPayment = { id, transactionType: 'sale', transactionId: saleId, lineNumber: existing.length + 1, method, amount, reference, createdAt: new Date().toISOString() };
      set((s) => ({ salePayments: [...s.salePayments, payment] }));
      db.insertPayment(payment);
    },
    removeSalePayment: (paymentId) => {
      set((s) => ({ salePayments: s.salePayments.filter((p) => p.id !== paymentId) }));
      db.deletePayment(paymentId);
    },
    completeSale: (saleId, employeeName) => {
      const state = get();
      const sale = state.sales.find((sl) => sl.id === saleId);
      if (!sale) return;
      const items = state.saleItems.filter((i) => i.salesTransactionId === saleId);
      const payments = state.salePayments.filter((p) => p.transactionId === saleId);

      const completedAt = new Date().toISOString();
      set((s) => ({ sales: s.sales.map((sl) => sl.id === saleId ? { ...sl, status: 'completed' as const, completedAt } : sl) }));
      db.updateSale(saleId, { status: 'completed', completedAt });

      items.forEach((item) => {
        if (item.inventoryItemId) {
          get().updateInventoryItem(item.inventoryItemId, { status: 'sold', soldAt: completedAt, quantityOnHand: 0 });
          try {
            const ebayStore = useEbayStore.getState();
            const ebayListing = ebayStore.getListingByInventoryId(item.inventoryItemId);
            if (ebayListing && ebayListing.status === 'listed') {
              ebayStore.setListing({ ...ebayListing, status: 'ended', endedAt: completedAt, lastSyncAt: completedAt });
              ebayStore.addSyncLog({ action: 'AUTO_END', sku: ebayListing.sku, itemTitle: `${item.brand} ${item.model}`, status: 'success', details: 'Auto-ended: item sold in-store' });
            }
          } catch (e) { console.error('eBay auto-end error:', e); }
        }
      });

      // Cash drawer — only CASH payments
      const cashTotal = round2(payments.filter((p) => p.method === 'cash').reduce((s2, p) => s2 + p.amount, 0));
      if (cashTotal > 0) {
        get().addDrawerEntry('sale', cashTotal, `Sale ${sale.saleCode} — Cash portion`, sale.employeeId, sale.storeId, 'sale', saleId);
      }

      get().logAction(sale.employeeId, employeeName, 'Sales', 'SALE_COMPLETE', 'sale', saleId,
        `Sale ${sale.saleCode} — $${sale.totalAmount.toFixed(2)} (${items.length} items)`);
    },
    voidSale: (saleId) => {
      const state = get();
      const items = state.saleItems.filter((i) => i.salesTransactionId === saleId);
      set((s) => ({ sales: s.sales.map((sl) => sl.id === saleId ? { ...sl, status: 'voided' as const } : sl) }));
      db.updateSale(saleId, { status: 'voided' });
      items.forEach((item) => {
        if (item.inventoryItemId) get().updateInventoryItem(item.inventoryItemId, { status: 'available', soldAt: null, quantityOnHand: 1 });
      });
    },

    // ── Returns ──
    createReturn: (data) => {
      const id = generateId('RET');
      const ret: Return = { ...data, id, returnCode: generateCode('RTN'), status: 'draft', createdAt: new Date().toISOString(), completedAt: null };
      set((s) => ({ returns: [ret, ...s.returns] }));
      db.insertReturn(data.storeId, ret);
      return id;
    },
    completeReturn: (returnId, employeeName) => {
      const state = get();
      const ret = state.returns.find((r) => r.id === returnId);
      if (!ret) return;
      const completedAt = new Date().toISOString();
      set((s) => ({ returns: s.returns.map((r) => r.id === returnId ? { ...r, status: 'completed' as const, completedAt } : r) }));
      db.updateReturn(returnId, { status: 'completed', completedAt });

      if (ret.sourceItemId) {
        const saleItem = state.saleItems.find((i) => i.id === ret.sourceItemId);
        if (saleItem?.inventoryItemId) {
          get().updateInventoryItem(saleItem.inventoryItemId, { status: 'returned', soldAt: null, quantityOnHand: 1 });
        }
      }

      // Cash drawer — only CASH refunds
      if (ret.refundMethod === 'cash' && ret.returnAmount > 0) {
        get().addDrawerEntry('return', -ret.returnAmount, `Return ${ret.returnCode} — Cash refund`, ret.employeeId, ret.storeId, 'return', returnId);
      }

      get().logAction(ret.employeeId, employeeName, 'Returns', 'RETURN_COMPLETE', 'return', returnId,
        `Return ${ret.returnCode} — $${ret.returnAmount.toFixed(2)} refunded via ${ret.refundMethod}`);
    },

    // ── Payment Changes ──
    createPaymentChange: (data) => {
      const id = generateId('PCH');
      const pc: PaymentChange = { ...data, id, status: 'draft', createdAt: new Date().toISOString(), completedAt: null };
      set((s) => ({ paymentChanges: [pc, ...s.paymentChanges] }));
      db.insertPaymentChange(data.storeId, pc);
      return id;
    },
    completePaymentChange: (changeId, employeeName) => {
      const state = get();
      const pc = state.paymentChanges.find((p) => p.id === changeId);
      if (!pc) return;
      const completedAt = new Date().toISOString();
      set((s) => ({ paymentChanges: s.paymentChanges.map((p) => p.id === changeId ? { ...p, status: 'completed' as const, completedAt } : p) }));
      db.updatePaymentChange(changeId, { status: 'completed', completedAt });

      // Cash drawer — calculate cash delta between old and new payments
      const oldCash = pc.oldPaymentJson.filter((p) => p.method === 'cash').reduce((s2, p) => s2 + p.amount, 0);
      const newCash = pc.newPaymentJson.filter((p) => p.method === 'cash').reduce((s2, p) => s2 + p.amount, 0);
      const rawDelta = round2(newCash - oldCash);

      // For sales: more cash = more money IN to drawer (positive delta)
      // For purchases: more cash = more money OUT of drawer (negative delta)
      // Purchases are payouts, so if cash increased, drawer DECREASES
      const drawerDelta = pc.transactionType === 'purchase' ? -rawDelta : rawDelta;

      if (drawerDelta !== 0) {
        const direction = drawerDelta > 0 ? 'Cash in' : 'Cash out';
        get().addDrawerEntry('adjustment', drawerDelta, `Payment change for ${pc.transactionRef} — ${direction} $${Math.abs(drawerDelta).toFixed(2)}`, pc.changedByEmployeeId, pc.storeId, 'payment-change', changeId);
      }

      get().logAction(pc.changedByEmployeeId, employeeName, 'Payment Changes', 'PAYMENT_CHANGE', 'payment-change', changeId,
        `Payment change for ${pc.transactionRef} — ${pc.reason}`);
    },

    // ── Purchase Changes ──
    createPurchaseChange: (data) => {
      const id = generateId('PCHG');
      const pc: PurchaseChange = { ...data, id, status: 'draft', createdAt: new Date().toISOString(), completedAt: null };
      set((s) => ({ purchaseChanges: [pc, ...s.purchaseChanges] }));
      db.insertPurchaseChange(data.storeId, pc);
      return id;
    },
    completePurchaseChange: (changeId, employeeName) => {
      const pc = get().purchaseChanges.find((p) => p.id === changeId);
      if (!pc) return;
      const completedAt = new Date().toISOString();
      set((s) => ({ purchaseChanges: s.purchaseChanges.map((p) => p.id === changeId ? { ...p, status: 'completed' as const, completedAt } : p) }));
      db.updatePurchaseChange(changeId, { status: 'completed', completedAt });
      get().logAction(pc.changedByEmployeeId, employeeName, 'Purchase Changes', 'PURCHASE_CHANGE', 'purchase-change', changeId,
        `Purchase change for ${pc.purchaseTransactionId} — ${pc.reason}`);
    },

    // ── Void Purchase ──
    voidPurchase: (purchaseId, reason, employeeId, employeeName) => {
      const state = get();
      const purchase = state.purchases.find((p) => p.id === purchaseId);
      if (!purchase || purchase.status !== 'completed') return;
      const storeId = purchase.storeId;
      const items = state.purchaseItems.filter((i) => i.purchaseTransactionId === purchaseId);
      const payments = state.purchasePayments.filter((p) => p.transactionId === purchaseId);

      // 1. Mark purchase as voided
      set((s) => ({ purchases: s.purchases.map((p) => p.id === purchaseId ? { ...p, status: 'voided' as const } : p) }));
      db.updatePurchase(purchaseId, { status: 'voided' });

      // 2. Remove inventory items created from this purchase
      items.filter((item) => item.isDeal).forEach((item) => {
        const invItem = state.inventory.find(
          (inv) => inv.sourcePurchaseItemId === item.id && (inv.status === 'available' || inv.status === 'listed')
        );
        if (invItem) {
          get().updateInventoryItem(invItem.id, { status: 'scrapped', quantityOnHand: 0, notes: `Voided — Purchase ${purchaseId} voided: ${reason}` });
        }
      });

      // 3. Reverse cash drawer if cash was paid out
      const cashTotal = round2(payments.filter((p) => p.method === 'cash').reduce((s2, p) => s2 + p.amount, 0));
      if (cashTotal > 0) {
        get().addDrawerEntry('adjustment', cashTotal, `Voided purchase ${purchaseId} — Cash reversal`, employeeId, storeId, 'purchase-void', purchaseId);
      }

      // 4. Log
      get().logAction(employeeId, employeeName, 'Purchase Changes', 'PURCHASE_VOID', 'purchase', purchaseId,
        `Purchase voided — ${items.length} items — $${purchase.totalAmount.toFixed(2)} — Reason: ${reason}`);
    },

    // ── Cash Drawer ──
    openDrawer: (amount, employeeId, storeId, employeeName) => {
      const entry: CashDrawerEntry = {
        id: generateId('DRE'), entryCode: generateCode('DR'), employeeId, storeId,
        entryType: 'open', amount, balanceAfter: amount, notes: 'Drawer opened', createdAt: new Date().toISOString(),
      };
      const drawer: CashDrawerState = { isOpen: true, openedAt: new Date().toISOString(), openedBy: employeeId, openingBalance: amount, currentBalance: amount, entries: [entry] };
      set({ cashDrawer: drawer });
      db.upsertCashDrawer(storeId, { isOpen: true, openedAt: drawer.openedAt!, openedBy: employeeId, openingBalance: amount, currentBalance: amount });
      db.insertDrawerEntry(storeId, entry);
      get().logAction(employeeId, employeeName, 'Cash Drawer', 'DRAWER_OPEN', 'drawer', entry.id, `Drawer opened with $${amount.toFixed(2)} float`);
    },
    closeDrawer: (employeeId, storeId, employeeName) => {
      const state = get();
      const entry: CashDrawerEntry = {
        id: generateId('DRE'), entryCode: generateCode('DR'), employeeId, storeId,
        entryType: 'close', amount: 0, balanceAfter: state.cashDrawer.currentBalance,
        notes: `Drawer closed — Final: $${state.cashDrawer.currentBalance.toFixed(2)}`, createdAt: new Date().toISOString(),
      };
      set((s) => ({ cashDrawer: { ...s.cashDrawer, isOpen: false, entries: [...s.cashDrawer.entries, entry] } }));
      db.upsertCashDrawer(storeId, { isOpen: false, openedAt: state.cashDrawer.openedAt, openedBy: state.cashDrawer.openedBy, openingBalance: state.cashDrawer.openingBalance, currentBalance: state.cashDrawer.currentBalance });
      db.insertDrawerEntry(storeId, entry);
      get().logAction(employeeId, employeeName, 'Cash Drawer', 'DRAWER_CLOSE', 'drawer', entry.id, `Drawer closed — $${state.cashDrawer.currentBalance.toFixed(2)}`);
    },
    addDrawerEntry: (type, amount, notes, employeeId, storeId, refType, refId) => {
      const state = get();
      const balance = round2(state.cashDrawer.currentBalance + amount);
      const entry: CashDrawerEntry = {
        id: generateId('DRE'), entryCode: generateCode('DR'), employeeId, storeId,
        entryType: type, referenceType: refType, referenceId: refId,
        amount, balanceAfter: balance, notes, createdAt: new Date().toISOString(),
      };
      set((s) => ({ cashDrawer: { ...s.cashDrawer, currentBalance: balance, entries: [...s.cashDrawer.entries, entry] } }));
      db.upsertCashDrawer(storeId, { isOpen: state.cashDrawer.isOpen, openedAt: state.cashDrawer.openedAt, openedBy: state.cashDrawer.openedBy, openingBalance: state.cashDrawer.openingBalance, currentBalance: balance });
      db.insertDrawerEntry(storeId, entry);
    },

    // ── Labels ──
    printLabel: (visitId, employeeId) => {
      const storeId = get().activeStoreId || STORE_ID;
      const existing = get().labels.find((l) => l.visitId === visitId);
      if (existing) {
        const updated = { ...existing, printCount: existing.printCount + 1, printedAt: new Date().toISOString() };
        set((s) => ({ labels: s.labels.map((l) => l.visitId === visitId ? updated : l) }));
        db.upsertLabel(storeId, updated);
      } else {
        const label: LabelPrintLog = { id: generateId('LBL'), visitId, printedByEmployeeId: employeeId, printedAt: new Date().toISOString(), printCount: 1 };
        set((s) => ({ labels: [...s.labels, label] }));
        db.upsertLabel(storeId, label);
      }
    },

    // ── Audit ──
    logAction: (actorId, actorName, module, action, recordType, recordId, details) => {
      const entry: AuditLogEntry = { id: generateId('AUD'), actorEmployeeId: actorId, actorName, module, action, recordType, recordId, details, createdAt: new Date().toISOString() };
      set((s) => ({ auditLog: [entry, ...s.auditLog] }));
      const storeId = get().activeStoreId;
      if (storeId) db.insertAudit(storeId, entry);
    },

    // ── Polling: refresh cash drawer from DB ──
    refreshCashDrawer: async () => {
      const storeId = get().activeStoreId;
      if (!storeId) return;
      try {
        const [drawerData, drawerEntries] = await Promise.all([
          db.getCashDrawer(storeId),
          db.getDrawerEntries(storeId),
        ]);
        if (drawerData) {
          set({ cashDrawer: { ...drawerData, entries: drawerEntries } });
        }
      } catch (err) {
        console.error('[POS] Cash drawer refresh error:', err);
      }
    },

    // ── Reset ──
    resetAll: () => {
      // Reset just clears in-memory state; database data persists
      set({
        customers: [], visits: [], purchases: [], purchaseItems: [], purchasePayments: [],
        inventory: [], sales: [], saleItems: [], salePayments: [],
        returns: [], paymentChanges: [], purchaseChanges: [],
        cashDrawer: emptyDrawer, auditLog: [], labels: [],
        isLoaded: false,
      });
    },
  })
);
