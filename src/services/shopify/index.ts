import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type {
  ShopifyCatalogService,
  ShopifyConnectionResult,
  ShopifyPublishRequest,
  ShopifyPublishResult,
} from './types';

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let errorMessage = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const textContent = await error.context?.text();
        const parsed = textContent ? JSON.parse(textContent) : null;
        errorMessage = parsed?.message || parsed?.error || textContent || error.message;
        if (parsed) return { data: parsed as T, error: errorMessage };
      } catch {
        errorMessage = error.message;
      }
    }
    return { data: null, error: errorMessage };
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
};

export type {
  ShopifyCatalogService,
  ShopifyConnectionResult,
  ShopifyPublishRequest,
  ShopifyPublishResult,
} from './types';
