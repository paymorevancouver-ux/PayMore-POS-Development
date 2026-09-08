/**
 * Frontend contracts for Shopify Auto Lister.
 * Admin API credentials must never appear here or in Vite env vars.
 */

import type { ShopifyTaxonomyAttribute, ShopifyTaxonomyCategory } from '@/types/shopify';

export type ShopifyPublishStatus =
  | 'not_configured'
  | 'validation_failed'
  | 'publishing'
  | 'published'
  | 'already_published'
  | 'already_publishing'
  | 'failed';

export interface ShopifyPublishRequest {
  listingId: string;
  storeId: string;
  employeeId: string;
  employeeName: string;
}

export interface ShopifyPublishResult {
  success: boolean;
  status: ShopifyPublishStatus;
  message: string;
  listingStatus?: string;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  shopifyInventoryItemId?: string;
  shopifyHandle?: string;
  shopifyAdminUrl?: string;
  shopifyStorefrontUrl?: string;
  shopifyUrl?: string;
  barcode?: string;
  labelEligible?: boolean;
  warnings?: string[];
  issues?: Array<{ field: string; message: string }>;
}

export interface ShopifyConnectionResult {
  connected: boolean;
  shopName?: string;
  shopDomain?: string;
  apiVersion?: string;
  locationName?: string;
  locationId?: string;
  scopes?: string[];
  capabilities?: string[];
  message: string;
}

export interface ShopifyConnectionRequest {
  storeId?: string;
  employeeId?: string;
  employeeName?: string;
}

export interface ShopifyTaxonomySearchRequest {
  action: 'search' | 'get' | 'suggest';
  employeeId?: string | null;
  storeId?: string | null;
  query?: string;
  id?: string;
  searchTerms?: string[];
}

export interface ShopifyTaxonomySearchResult {
  success: boolean;
  error?: string;
  categories: ShopifyTaxonomyCategory[];
  category?: ShopifyTaxonomyCategory | null;
  attributes?: ShopifyTaxonomyAttribute[];
}

export interface ShopifyInventorySyncRequest {
  inventoryItemId: string;
  reason: string;
  storeId?: string;
  employeeId?: string;
  employeeName?: string;
  posSaleId?: string;
  posReturnId?: string;
}

export interface ShopifyInventorySyncResult {
  success: boolean;
  status: 'synced' | 'pending' | 'error' | 'skipped';
  message: string;
  inventoryItemId?: string;
  listingId?: string | null;
  quantityOnHand?: number;
  shopifyQuantity?: number;
  shopifyProductId?: string | null;
  shopifyProductStatus?: 'ACTIVE' | 'ARCHIVED' | null;
  code?: string;
  error?: string;
}

export interface ShopifyWebhookRegistrationResult {
  success: boolean;
  callbackUrl?: string;
  topics?: string[];
  subscriptions?: Array<{ topic: string; id?: string | null; callbackUrl?: string }>;
  requiredScopes?: string[];
  errors?: string[];
  error?: string;
  deployNote?: string;
}

export interface ShopifyCatalogService {
  publishListing(request: ShopifyPublishRequest): Promise<ShopifyPublishResult>;
  testConnection(request?: ShopifyConnectionRequest): Promise<ShopifyConnectionResult>;
  searchTaxonomy(request: ShopifyTaxonomySearchRequest): Promise<ShopifyTaxonomySearchResult>;
  syncInventory(request: ShopifyInventorySyncRequest): Promise<ShopifyInventorySyncResult>;
  registerWebhooks(request: { employeeId: string; storeId?: string }): Promise<ShopifyWebhookRegistrationResult>;
}
