PayMore POS — Complete Project Analysis
Analysis only — no files were modified.

1. Overall Architecture
PayMore POS is a single-page React application for a second-hand electronics buy/sell retail operation (Canadian GST/PST). It is built as a production terminal with Supabase as the sole backend — no localStorage for business data.

Browser (Vite + React 18)
Data Layer
Supabase
loadStoreData()
/login PIN auth
Pages (/pos/*)
Feature Components
authStore (Zustand + persist)
posStore (Zustand in-memory cache)
ebayStore (Zustand + persist)
lib/database.ts
lib/taxCalc.ts
lib/barcode.ts
pos_* tables
Edge Functions
id_scan_sessions
Architectural patterns:

Routing: React Router v6 — public /login, /id-upload/:token, protected /pos/*
State: Zustand stores; posStore is the domain brain (mutations + DB sync)
UI: shadcn/ui + Radix + Tailwind CSS
Single-store: All DB queries filtered by store_id STR-001 (PayMore Vancouver)
First-load: Store record ensured on login; customer/inventory/employee data imported via CSV (no auto-seed)
Entry flow:

LoginPage → PIN login via authStore
loadStoreData(storeId) → parallel fetch from Supabase
AuthGate blocks UI until isLoaded === true
AppShell wraps all POS routes with sidebar, header, session timeout, cash drawer polling
2. Folder Structure
8Eqg9WNJwCGnCiSoCazYJX/
├── .cursor/                    # AI rules (paymore-pos.mdc)
├── public/                     # Static assets (robots.txt, placeholder.svg)
├── supabase/functions/         # Edge Functions
│   ├── _shared/cors.ts
│   ├── ebay-sync/              # eBay API integration
│   ├── extract-id-data/        # AI ID OCR extraction
│   └── id-scan-session/        # QR/mobile ID upload sessions
├── src/
│   ├── App.tsx                 # Router + AuthGate
│   ├── main.tsx                # React entry
│   ├── types/index.ts          # All domain TypeScript types
│   ├── stores/
│   │   ├── authStore.ts        # Auth, employees, permissions
│   │   ├── posStore.ts         # Core POS business logic (~846 lines)
│   │   └── ebayStore.ts        # eBay listing state (local persist)
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client
│   │   ├── database.ts         # DB service layer + mappers
│   │   ├── taxCalc.ts          # Tax, IDs, device codes, formatting
│   │   ├── barcode.ts          # Label generation (JsBarcode, jsPDF)
│   │   └── utils.ts
│   ├── constants/
│   │   ├── config.ts           # Tax rates, roles, permissions, enums
│   │   ├── mockData.ts         # Store list, empty mocks
│   │   └── migrationData.ts    # Production seed data (customers, inventory, employees)
│   ├── pages/                  # One page per module (15 pages)
│   ├── components/
│   │   ├── layout/             # AppShell, Sidebar, Header
│   │   ├── features/           # Domain-specific reusable components
│   │   └── ui/                 # shadcn/ui primitives (~40 components)
│   └── hooks/                  # use-toast, use-mobile
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── components.json             # shadcn config
Note: No SQL migration files in the repo — schema is implied by database.ts and must exist in Supabase already.

3. Database Architecture
All tables use the pos_ prefix. Multi-tenant isolation is via store_id on nearly every table.

Table	Purpose	Key relationships
pos_stores
Store metadata (name, address, GST/PST)
Root entity
pos_employees
Staff, PIN, role
store_id
pos_settings
Key-value config per store
store_id + key (unique)
pos_customers
Customer PII / ID info
store_id
pos_visits
Customer visit records
→ customer_id, employee_id
pos_purchases
Buy transactions
→ visit_id, customer_id
pos_purchase_items
Devices bought per purchase
→ purchase_transaction_id
pos_payments
Payments (purchase or sale)
transaction_type + transaction_id
pos_inventory
Device stock + location + label tracking
→ optional source_purchase_item_id, visit_id
pos_location_history
Storage move audit trail
→ inventory_item_id
pos_sales
Sale transactions
→ customer_id (optional)
pos_sale_items
Line items with tax/profit snapshots
→ sales_transaction_id, inventory_item_id
pos_returns
Sale/purchase returns
→ source transaction + item
pos_payment_changes
Payment correction records
JSON old/new payments
pos_purchase_changes
Purchase item correction records
JSON old/new values
pos_cash_drawer
Current drawer state (1 row/store)
store_id unique
pos_cash_drawer_entries
Ledger of drawer movements
store_id
pos_audit_log
System audit trail
store_id
pos_labels
Book label print log (visit-based)
→ visit_id
id_scan_sessions
Mobile ID upload QR sessions
Used by edge function only
Settings keys used:

data_seeded, next_visit_number, next_device_number, next_sale_number
Device code format: BC05-000001 (PayMore Vancouver, STR-001). Visit codes: BC-02-{n}. Book label location: V, A

Data access layer: src/lib/database.ts — snake_case ↔ camelCase mappers, generic CRUD helpers

4. Authentication
Aspect	Implementation
Method
Employee PIN (not Supabase Auth)
Main files
LoginPage.tsx, authStore.ts, PinPad.tsx, ProtectedRoute.tsx
Session
Zustand persist key paymore-auth-v3 — employee, store, lastActivity
Timeout
Default 30 min; checked on route change + 60s interval in AppShell
Permissions
Role-based via ROLE_PERMISSIONS in config.ts
Employee source
Loaded from pos_employees on login; fallback PROD_EMPLOYEES in migrationData.ts
Roles:

Role	Access
admin
* (everything including users)
manager
All modules except users
cashier
dashboard, sales, customer, drawer, returns, inventory, labels
buyer
dashboard, customer, purchases*, inventory, labels, drawer
Known quirk: Buyer role lists 'purchases' in permissions, but the route guard uses requiredModule="customer" for the buy workflow — buyer access works via 'customer', not 'purchases'.

Risk if modified: CRITICAL — PIN auth, session timeout, and hasPermission() gate every module.

5. Customer Visit Workflow
Route: /pos/customer
Main file: CustomerVisitPage.tsx (~1263 lines)
Purpose: End-to-end buy-from-customer flow (visit + purchase combined)

Wizard steps: search → customer-form → devices → payment → complete

Yes
No
Search Customer
Found?
Validate 18+ / phone / email
Create / Edit Customer
createVisit + createPurchase
Add Devices
Add Payments
completePurchase
Inventory created for deal items
Cash drawer payout if cash
Book Label print
Category	Files
Main
CustomerVisitPage.tsx
Supporting
posStore.ts (createVisit, createPurchase, addPurchaseItem, completePurchase, printLabel)
Shared components
BookLabelDialog, IdScanner, QrIdScanner, DevicePhotoCapture, CustomerHistoryPanel
DB tables
pos_customers, pos_visits, pos_purchases, pos_purchase_items, pos_payments, pos_inventory, pos_labels, pos_audit_log, pos_cash_drawer*
Dependencies
authStore, config.ts, taxCalc.ts, Supabase edge functions for ID scan
Risk
CRITICAL — Core revenue-in flow; touches customer PII, purchases, inventory creation
Key behaviors:

ID scanning via camera (IdScanner) or QR mobile upload (QrIdScanner → id-scan-session edge function)
Customer must be 18+, valid email/phone
isDeal: true items become inventory on completePurchase
Book labels printed via BookLabelDialog + pos.printLabel()
6. Purchases Workflow
Purchases are not a separate page — they live inside Customer Visit. Corrections have dedicated pages.

Category	Files
Main (creation)
CustomerVisitPage.tsx + posStore.completePurchase()
Corrections main
PurchaseChangesPage.tsx
Supporting
posStore.ts — createPurchase, addPurchaseItem, voidPurchase, createPurchaseChange
Shared components
BookLabelDialog, ReceiptPreview
DB tables
pos_purchases, pos_purchase_items, pos_payments, pos_purchase_changes, pos_inventory, pos_audit_log, pos_cash_drawer*
Dependencies
taxCalc (totals), config (payment methods, conditions)
Risk
CRITICAL for store logic; HIGH for corrections UI
Purchase lifecycle:

Draft purchase created with visit
Items added with buy price, condition, photos, isDeal flag
Payments recorded (must sum to total)
completePurchase → status completed, inventory for deals, cash drawer payout
voidPurchase → scrapped inventory, cash reversal, audit log
7. Inventory Workflow
Route: /pos/inventory
Main file: InventoryPage.tsx (~961 lines)

Status pipeline:

available (Not Listed) → listed (Live Products) → sold → returned / scrapped
Purchase complete OR manual add
available (Not Listed)
Assign storage location
Generate barcode label
listed (Live Products)
Sale completes
sold
Return
returned
Category	Files
Main
InventoryPage.tsx, LabelGeneratorPage.tsx
Supporting
posStore.ts — addInventoryItem, assignInventoryLocation, generateInventoryLabel, recordInventoryLabelPrint
Shared components
BarcodeLabelDialog, LocationAssignmentDialog, DeviceBarcodeScannerDialog
DB tables
pos_inventory, pos_location_history, pos_settings (device numbering), pos_audit_log
Dependencies
barcode.ts, taxCalc.ts (device codes), config.ts (categories, statuses)
Risk
CRITICAL — Inventory is the bridge between purchases and sales
Mark Available workflow (InventoryPage): Location → Label → status listed (enforced sequentially)

8. Sales Workflow
Route: /pos/sales
Main file: SalesPage.tsx (~425 lines)

Category	Files
Main
SalesPage.tsx
Supporting
posStore.ts — createSale, addSaleItem, completeSale, voidSale
Shared components
SalesInvoiceDialog, BarcodeScanner (optional scan)
DB tables
pos_sales, pos_sale_items, pos_payments, pos_inventory, pos_audit_log, pos_cash_drawer*
Dependencies
taxCalc.ts (GST 5%, PST 7%, tax modes), ebayStore (auto-end listings on sale)
Risk
CRITICAL — Revenue-out flow
Flow:

Create draft sale
Add items from listed inventory OR non-inventory line items
Tax recalculated per line (recalcSale in posStore)
Split payments until fully paid
completeSale → inventory → sold, cash drawer credit for cash, eBay listing ended if applicable
Invoice shown via SalesInvoiceDialog
9. Returns Workflow
Route: /pos/returns
Main file: ReturnsPage.tsx (~762 lines)

Category	Files
Main
ReturnsPage.tsx
Supporting
posStore.ts — createReturn, completeReturn
Shared components
UI cards, tabs, dialogs (inline)
DB tables
pos_returns, pos_sales, pos_sale_items, pos_inventory, pos_cash_drawer*, pos_audit_log
Dependencies
config refund methods, taxCalc formatting
Risk
HIGH — Affects inventory state and cash drawer
Flow: Search completed sale → select items → choose refund method → completeReturn → inventory back to returned, cash drawer debited if cash refund

10. Reports
Route: /pos/reports
Main file: ReportsPage.tsx (~905 lines)

Tab	Content
Overview
Revenue, COGS, gross profit/margin, purchases, returns, category breakdown, payment method split
Product Profit
Per-product revenue/cost/profit with search, sort, category filter
Inventory Aging
Days-on-hand analysis for unsold inventory
Category	Details
Main
ReportsPage.tsx
Supporting
Reads from posStore in-memory (no separate report queries)
DB tables
Derived from sales, sale_items, purchases, returns, inventory already loaded
Dependencies
taxCalc.ts, date range presets
Risk
MEDIUM — Read-only aggregations; wrong filters won't corrupt data
Also: DashboardPage.tsx provides today's KPIs; UserManagementPage.tsx has employee performance stats.

11. Barcode Labels
Category	Files
Main UI
BarcodeLabelDialog.tsx, LabelGeneratorPage.tsx, InventoryPage.tsx
Engine
lib/barcode.ts
Store logic
posStore.generateInventoryLabel(), recordInventoryLabelPrint()
DB tables
pos_inventory (label fields), pos_audit_log
Dependencies
JsBarcode (dynamic import — not in package.json), jsPDF, taxCalc
Label content:

Code128 barcode from deviceCode (+ optional location suffix)
Brand/model description
Print via browser window or PDF download
Inventory fields tracked: labelGenerated, labelGeneratedAt, labelGeneratedBy, labelPrintCount, lastLabelPrintAt, lastLabelPrintBy

Risk: HIGH — Label format affects floor operations; jsbarcode missing from package.json is a deployment risk

12. Book Labels
Category	Files
Main
BookLabelDialog.tsx
Used in
CustomerVisitPage.tsx (post-purchase + reprint)
Store logic
posStore.printLabel(visitId, employeeId)
DB tables
pos_labels (visit-based print log)
Dependencies
Customer/visit/purchase data from posStore, mockData.STORES for store info
Purpose: Regulatory/compliance label with customer ID info, visit code, deal items, employee — printed after a buy transaction.

Risk: HIGH — Legal/compliance document; format changes need careful review

13. Cash Drawer
Route: /pos/drawer
Main file: CashDrawerPage.tsx

Category	Files
Main
CashDrawerPage.tsx
Supporting
posStore.ts — openDrawer, closeDrawer, addDrawerEntry, refreshCashDrawer
Layout integration
AppShell.tsx (30s poll), Sidebar.tsx (balance display)
DB tables
pos_cash_drawer, pos_cash_drawer_entries
Dependencies
Auto-updated from sales/purchases/returns/payment changes
Entry types: open, close, sale, purchase, return, adjustment, payout

Only cash payments affect the drawer balance in automated flows.

Risk: CRITICAL — Financial accuracy; reconciliation UI compares stored vs computed balance

14. Employee Login
Category	Files
Login UI
LoginPage.tsx, PinPad.tsx
Management
UserManagementPage.tsx (admin only)
Settings
SettingsPage.tsx (change own PIN, session timeout)
Store
authStore.ts
DB tables
pos_employees
Seed data
migrationData.ts → PROD_EMPLOYEES
Features: Add/edit/deactivate employees, PIN reset, login activity log (in-memory, max 500 entries), role assignment

Risk: CRITICAL — Security and access control

15. Supabase Integration
Layer	File / Location
Client
src/lib/supabase.ts — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
Service layer
src/lib/database.ts — all CRUD
Edge Functions
supabase/functions/
Edge Functions:

Function	Purpose
id-scan-session
Create/validate QR sessions; store extracted ID in id_scan_sessions
extract-id-data
AI vision OCR of ID photos (ONSPACE_AI API)
ebay-sync
eBay OAuth + listing CRUD (production API)
Integration points in app:

Login → load all store data via anon client
IdUploadPage → public mobile ID upload (no auth)
QrIdScanner / IdScanner → invoke edge functions
ebayStore.invokeEbay() → ebay-sync (listing management; lightly wired — mainly auto-end on in-store sale)
Risk: CRITICAL for database.ts and env vars; HIGH for edge functions (external API keys)

16. State Management (Zustand)
Store	Persist?	Responsibility
authStore
Yes (paymore-auth-v3)
Employee session, permissions, employee CRUD, login activity
posStore
No
All POS domain data + mutations → DB
ebayStore
Yes (paymore-ebay-v1)
eBay auth tokens, listings, sync logs
posStore design:

Loaded once per login via loadStoreData(storeId)
Every mutation: update Zustand state and write to Supabase via db.*
No React Query / Redux used (despite being in package.json)
Key posStore domains: customers, visits, purchases, inventory, sales, returns, payment/purchase changes, cash drawer, audit log, labels

Risk: CRITICAL — posStore.ts is the single source of business logic; any change can affect all modules

Complete Project Map
Authentication Layer
Core POS (/pos)
Zustand
Libraries
Shared Features
LoginPage
authStore
ProtectedRoute
DashboardPage
CustomerVisitPage
InventoryPage
SalesPage
ReturnsPage
CashDrawerPage
LabelGeneratorPage
ReportsPage
PaymentChangesPage
PurchaseChangesPage
UserManagementPage
SettingsPage
AuditPage
posStore
ebayStore
database.ts
taxCalc.ts
barcode.ts
supabase.ts
BookLabelDialog
BarcodeLabelDialog
LocationAssignmentDialog
IdScanner / QrIdScanner
SalesInvoiceDialog
PinPad
Module Risk Summary
Module	Risk if Modified	Reason
posStore.ts
CRITICAL
All business rules, DB sync, financial side effects
database.ts
CRITICAL
Schema mapping, all persistence
types/index.ts
CRITICAL
Type contract across entire app
authStore.ts + config.ts permissions
CRITICAL
Security boundary
CustomerVisitPage.tsx
CRITICAL
Buy flow + PII
SalesPage.tsx
CRITICAL
Revenue + tax
InventoryPage.tsx
HIGH
Stock pipeline
CashDrawerPage.tsx / drawer logic
CRITICAL
Cash accuracy
ReturnsPage.tsx
HIGH
Refunds + inventory reversal
BarcodeLabelDialog / barcode.ts
HIGH
Floor operations
BookLabelDialog
HIGH
Compliance labels
ReportsPage.tsx
MEDIUM
Read-only analytics
PaymentChangesPage / PurchaseChangesPage
HIGH
Post-transaction corrections
components/ui/*
LOW
Presentation only
Supabase edge functions
HIGH
External integrations
Notable Observations
No Supabase Auth — security relies on PIN + role permissions client-side; RLS policies in Supabase are not visible in this repo.
Purchases embedded in Customer Visit — there is no standalone /pos/purchases route.
Unused dependencies in package.json: @reduxjs/toolkit, react-redux, @tanstack/react-query, @stripe/*, three, @react-three/*, etc. — not referenced in src/.
jsbarcode used but not declared in package.json — may work via transitive dep or may break on clean install.
@/assets/login-hero.jpg referenced in LoginPage but assets folder not present in file listing — possible missing asset.
First-load seeding writes real production migration data automatically — important for new store deployments.