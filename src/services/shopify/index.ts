import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { describeEdgeFunctionError } from '@/lib/shopify/functionErrors';
import type {
  ShopifyCatalogService,
  ShopifyConnectionResult,
  ShopifyInventorySyncResult,
  ShopifyPublishRequest,
  ShopifyPublishResult,
  ShopifyTaxonomySearchResult,
  ShopifyWebhookRegistrationResult,
} from './types';

async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>,
  prefix?: string,
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let payload = data as T | null;
    if (error instanceof FunctionsHttpError) {
      try {
        const textContent = await error.context?.text();
        const parsed = textContent ? JSON.parse(textContent) : null;
        if (parsed) payload = parsed as T;
      } catch {
        payload = data as T | null;
      }
    }
    return {
      data: payload,
      error: describeEdgeFunctionError(name, error, payload as { error?: string; message?: string } | null, prefix),
    };
  }
  return { data: data as T, error: null };
}

export const shopifyCatalogService: ShopifyCatalogService = {
  async publishListing(request) {
    const { data, error } = await invokeFunction<ShopifyPublishResult>('shopify-publish-product', {
      listing_id: request.listingId,
      store_id: request.storeId,
      employee_id: request.employeeId,
      employee_name: request.employeeName,
    });
    if (data) return data;
    return {
      success: false,
      status: 'failed',
      message: error || 'Shopify publish failed.',
    };
  },

  async testConnection(request) {
    const { data, error } = await invokeFunction<ShopifyConnectionResult>('shopify-test-connection', {
      store_id: request?.storeId,
      employee_id: request?.employeeId,
      employee_name: request?.employeeName,
    });
    if (data) return data;
    return {
      connected: false,
      message: error || 'Shopify connection test failed. Confirm Edge Function secrets are configured.',
    };
  },

  async searchTaxonomy(request) {
    const { data, error } = await invokeFunction<ShopifyTaxonomySearchResult>('shopify-taxonomy', {
      action: request.action,
      employee_id: request.employeeId,
      store_id: request.storeId,
      query: request.query,
      id: request.id,
      search_terms: request.searchTerms,
    }, 'Shopify taxonomy failed');
    if (error) {
      return {
        success: false,
        error,
        categories: [],
      };
    }
    if (data) {
      return {
        success: data.success !== false,
        error: data.success === false
          ? `Shopify taxonomy failed: ${data.error || 'Unable to load Shopify categories.'}`
          : undefined,
        categories: data.categories || [],
        category: data.category,
        attributes: data.attributes,
      };
    }
    return {
      success: false,
      error: 'Shopify taxonomy failed: Unable to load Shopify categories.',
      categories: [],
    };
  },

  async syncInventory(request) {
    const { data, error } = await invokeFunction<ShopifyInventorySyncResult>('shopify-sync-inventory', {
      inventory_item_id: request.inventoryItemId,
      reason: request.reason,
      store_id: request.storeId,
      employee_id: request.employeeId,
      employee_name: request.employeeName,
      pos_sale_id: request.posSaleId,
      pos_return_id: request.posReturnId,
      direction: 'pos_to_shopify',
    }, 'Shopify inventory sync failed');
    if (data) return data;
    return {
      success: false,
      status: 'error',
      message: error || 'SHOPIFY_SYNC_REQUIRED',
      inventoryItemId: request.inventoryItemId,
    };
  },

  async registerWebhooks(request) {
    const { data, error } = await invokeFunction<ShopifyWebhookRegistrationResult>('shopify-register-webhooks', {
      employee_id: request.employeeId,
      store_id: request.storeId,
    }, 'Shopify webhook registration failed');
    if (data) return data;
    return { success: false, error: error || 'Shopify webhook registration failed.' };
  },
};

export type {
  ShopifyCatalogService,
  ShopifyConnectionResult,
  ShopifyPublishRequest,
  ShopifyPublishResult,
} from './types';
