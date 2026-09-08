import type { ShopifyListingStatus } from '@/types/shopify';

export const MAX_SHOPIFY_SELECTION = 10;

export const MAX_SHOPIFY_PHOTOS = 12;

export const SHOPIFY_PHOTO_SESSION_MINUTES = 30;

export const SHOPIFY_PHOTO_MAX_EDGE_PX = 2800;

export const SHOPIFY_TAXONOMY_SEARCH_DEBOUNCE_MS = 300;

export const SHOPIFY_STATUS_LABELS: Record<ShopifyListingStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  publishing: 'Publishing',
  active: 'Active on Shopify',
  error: 'Error',
  ended: 'Ended',
  sold: 'Sold',
};

export const SHOPIFY_STATUS_COLORS: Record<ShopifyListingStatus, string> = {
  draft: 'text-amber-700 bg-amber-50 border-amber-200',
  ready: 'text-sky-700 bg-sky-50 border-sky-200',
  publishing: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  active: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  error: 'text-red-700 bg-red-50 border-red-200',
  ended: 'text-slate-600 bg-slate-50 border-slate-200',
  sold: 'text-purple-700 bg-purple-50 border-purple-200',
};

export const UNKNOWN_VALUES = new Set([
  '',
  'unknown',
  'not applicable',
  'n/a',
  'na',
  'not-applicable',
  'not recorded',
]);

export const COMMON_ACCESSORIES = [
  { id: 'original-charger', label: 'Original Charger' },
  { id: 'replacement-charger', label: 'Replacement Charger' },
  { id: 'power-cable', label: 'Power Cable' },
  { id: 'usb-cable', label: 'USB Cable' },
  { id: 'hdmi-cable', label: 'HDMI Cable' },
  { id: 'controller', label: 'Controller' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'mouse', label: 'Mouse' },
  { id: 'stylus', label: 'Stylus' },
  { id: 'case', label: 'Case' },
  { id: 'original-box', label: 'Original Box' },
  { id: 'manual', label: 'Manual' },
  { id: 'battery', label: 'Battery' },
  { id: 'lens', label: 'Lens' },
  { id: 'lens-cap', label: 'Lens Cap' },
  { id: 'camera-strap', label: 'Camera Strap' },
  { id: 'memory-card', label: 'Memory Card' },
] as const;
