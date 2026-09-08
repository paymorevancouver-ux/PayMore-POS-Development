import type { TaxMode, EmployeeRole } from '@/types';

export const APP_NAME = 'Paymore POS';
export const APP_VERSION = '2.0.0';

export const GST_RATE = 0.05;
export const PST_RATE = 0.07;

export const TAX_MODES: { value: TaxMode; label: string }[] = [
  { value: 'both', label: 'GST + PST' },
  { value: 'gst-only', label: 'GST Only' },
  { value: 'pst-only', label: 'PST Only' },
  { value: 'exempt', label: 'Exempt' },
];

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'debit', label: 'Interac / Debit' },
  { value: 'credit', label: 'Credit Card' },
  { value: 'etransfer', label: 'E-Transfer' },
  { value: 'store-credit', label: 'Store Credit' },
  { value: 'other', label: 'Other' },
] as const;

export const SALES_CHANNELS = [
  { value: 'in-store', label: 'In-Store' },
  { value: 'online', label: 'Online' },
  { value: 'phone', label: 'Phone' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'shopify', label: 'Shopify' },
] as const;

export const DEVICE_CONDITIONS = [
  { value: 'new', label: 'New', color: 'text-emerald-800 bg-emerald-50' },
  { value: 'open-box', label: 'Open Box', color: 'text-cyan-700 bg-cyan-50' },
  { value: 'excellent', label: 'Excellent', color: 'text-teal-700 bg-teal-50' },
  { value: 'very-good', label: 'Very Good', color: 'text-sky-700 bg-sky-50' },
  { value: 'good', label: 'Good', color: 'text-blue-700 bg-blue-50' },
  { value: 'fair', label: 'Fair', color: 'text-amber-700 bg-amber-50' },
  { value: 'for-parts', label: 'For Parts / Not Working', color: 'text-slate-700 bg-slate-50' },
  { value: 'mint', label: 'Mint', color: 'text-emerald-700 bg-emerald-50' },
  { value: 'poor', label: 'Poor', color: 'text-red-700 bg-red-50' },
] as const;

export const LEGACY_CATEGORIES = [
  'Smartphones',
  'Laptops',
  'Tablets',
  'Wearables',
  'Audio',
  'Gaming',
  'Accessories',
  'Cameras',
  'Desktops',
  'Other',
] as const;

export const DEVICE_CATEGORY_LABELS = [
  'Apple iPhone',
  'Android Phone',
  'Windows Laptop',
  'MacBook',
  'Windows Desktop',
  'Custom/Gaming PC',
  'iMac / Mac Desktop',
  'iPad',
  'Android Tablet',
  'Digital Camera',
  'DSLR Camera',
  'Mirrorless Camera',
  'Action Camera',
  'PlayStation Console',
  'Xbox Console',
  'Nintendo Console',
  'Gaming Handheld',
  'Apple Watch',
  'Smartwatch',
  'Headphones',
  'Earbuds',
  'Speakers',
  'Monitor',
  'GPU / Graphics Card',
  'Computer Component',
  'Other Electronics',
] as const;

/** Intake + filter list. Legacy labels remain so older inventory still filters. */
export const CATEGORIES = [...DEVICE_CATEGORY_LABELS, ...LEGACY_CATEGORIES] as const;

export const INVENTORY_STATUSES = [
  { value: 'available', label: 'Non-Listed', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'listed', label: 'Listed', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { value: 'sold', label: 'Sold', color: 'text-slate-600 bg-slate-50 border-slate-200' },
  { value: 'reserved', label: 'Reserved', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  { value: 'returned', label: 'Returned', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { value: 'defective', label: 'Defective', color: 'text-red-700 bg-red-50 border-red-200' },
  { value: 'scrapped', label: 'Scrapped', color: 'text-stone-700 bg-stone-50 border-stone-200' },
] as const;

export const ID_TYPES = [
  { value: 'drivers-license', label: "Driver's License" },
  { value: 'passport', label: 'Passport' },
  { value: 'provincial-id', label: 'Provincial ID' },
  { value: 'other', label: 'Other' },
] as const;

export const PROVINCES = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
] as const;

// Role permissions
export const ROLE_PERMISSIONS: Record<EmployeeRole, string[]> = {
  admin: ['*'],
  manager: ['dashboard', 'customer', 'purchases', 'sales', 'inventory', 'shopify-lister', 'labels', 'returns', 'payment-changes', 'purchase-changes', 'drawer', 'reports', 'audit', 'settings'],
  cashier: ['dashboard', 'sales', 'customer', 'drawer', 'returns', 'inventory', 'shopify-lister', 'labels'],
  buyer: ['dashboard', 'customer', 'purchases', 'inventory', 'shopify-lister', 'labels', 'drawer'],
};
