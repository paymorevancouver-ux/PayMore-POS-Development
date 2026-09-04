import type { DeviceCondition } from '@/types';

export type ShopifyListingStatus =
  | 'draft'
  | 'ready'
  | 'publishing'
  | 'active'
  | 'error'
  | 'ended'
  | 'sold';

export type ShopifyTestResult = 'pass' | 'fail' | 'not-tested' | 'not-applicable';

export interface ShopifyAccessory {
  id: string;
  label: string;
  included: boolean;
  quantity?: number;
  custom?: boolean;
}

export interface ShopifyStorageDevice {
  type: string;
  capacity: string;
}

export interface ShopifyLens {
  brand: string;
  model: string;
  focalLength: string;
  maxAperture: string;
  mount: string;
  serialNumber: string;
  condition: string;
}

export interface ShopifyListing {
  id: string;
  storeId: string;
  inventoryItemId: string;
  status: ShopifyListingStatus;
  title: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  quantity: number;
  condition: DeviceCondition | string;
  shopifyVendor: string;
  shopifyProductType: string;
  sku: string;
  barcode: string;
  tags: string[];
  photos: string[];
  attributes: Record<string, unknown>;
  accessories: ShopifyAccessory[];
  testingResults: Record<string, ShopifyTestResult>;
  staffNotes: string;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  shopifyInventoryItemId: string | null;
  shopifyHandle: string | null;
  shopifyUrl: string | null;
  shopifyAdminUrl?: string | null;
  shopifyStorefrontUrl?: string | null;
  publishAttempts?: number;
  lastPublishAttemptAt?: string | null;
  publishWarning?: string | null;
  shopifyLocationId?: string | null;
  lastError: string | null;
  createdByEmployeeId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  lastSyncedAt: string | null;
  endedAt: string | null;
}

export const SHOPIFY_LISTING_STATUSES: ShopifyListingStatus[] = [
  'draft',
  'ready',
  'publishing',
  'active',
  'error',
  'ended',
  'sold',
];

export const BLOCKING_SHOPIFY_STATUSES: ShopifyListingStatus[] = ['publishing', 'active'];

export const CONTINUABLE_SHOPIFY_STATUSES: ShopifyListingStatus[] = ['draft', 'ready', 'error'];
