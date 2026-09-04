/**
 * Frontend contracts for Shopify Auto Lister.
 * Admin API credentials must never appear here or in Vite env vars.
 */

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

export interface ShopifyCatalogService {
  publishListing(request: ShopifyPublishRequest): Promise<ShopifyPublishResult>;
  testConnection(request?: ShopifyConnectionRequest): Promise<ShopifyConnectionResult>;
}
