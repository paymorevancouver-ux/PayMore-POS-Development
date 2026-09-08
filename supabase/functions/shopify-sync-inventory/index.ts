import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sanitizeShopifyError } from '../_shared/shopify.ts';
import { syncShopifyInventoryForItem } from '../_shared/shopify-inventory-sync.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '',
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'POST required.' }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const inventoryItemId = String(body.inventory_item_id || body.inventoryItemId || '').trim();
    const reason = String(body.reason || 'SHOPIFY_INVENTORY_SYNC').trim();
    if (!inventoryItemId) {
      return json({ success: false, error: 'inventory_item_id is required.' }, 400);
    }

    const result = await syncShopifyInventoryForItem(supabase, {
      inventoryItemId,
      reason,
      storeId: body.store_id ? String(body.store_id) : null,
      employeeId: body.employee_id ? String(body.employee_id) : null,
      employeeName: body.employee_name ? String(body.employee_name) : null,
      posSaleId: body.pos_sale_id ? String(body.pos_sale_id) : null,
      posReturnId: body.pos_return_id ? String(body.pos_return_id) : null,
      shopifyOrderId: body.shopify_order_id ? String(body.shopify_order_id) : null,
      shopifyRefundId: body.shopify_refund_id ? String(body.shopify_refund_id) : null,
      direction: body.direction ? String(body.direction) : 'pos_to_shopify',
    });

    return json(result, result.success || result.status === 'skipped' ? 200 : 200);
  } catch (err) {
    return json({
      success: false,
      status: 'error',
      message: sanitizeShopifyError(err instanceof Error ? err.message : 'Shopify inventory sync failed.'),
    }, 200);
  }
});
