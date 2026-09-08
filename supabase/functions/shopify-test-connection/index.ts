import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  sanitizeShopifyError,
  shopifyApiVersion,
  shopifyConfiguredLocationId,
  shopifyGraphql,
  shopifyStoreDomain,
  shopifyCredentialsConfigured,
} from '../_shared/shopify.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '',
);

const REQUIRED_SCOPES = [
  'read_products',
  'write_products',
  'read_inventory',
  'write_inventory',
  'read_locations',
  'read_orders',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ connected: false, message: 'POST required.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const employeeId = String(body.employee_id || '').trim();
    const { data: employee } = employeeId
      ? await supabase.from('pos_employees').select('id, is_active, store_id').eq('id', employeeId).maybeSingle()
      : { data: null };
    if (!employee || employee.is_active === false) {
      return json({ connected: false, apiVersion: shopifyApiVersion(), message: 'A valid active employee must test the Shopify connection.' }, 403);
    }

    const domain = shopifyStoreDomain();
    if (!domain || !shopifyCredentialsConfigured()) {
      return json({
        connected: false,
        apiVersion: shopifyApiVersion(),
        message: 'Shopify secrets are not configured. Set SHOPIFY_STORE_DOMAIN and either SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET.',
      }, 200);
    }

    const result = await shopifyGraphql<{
      shop: { name: string; myshopifyDomain: string };
      locations: { nodes: Array<{ id: string; name: string; isActive: boolean }> };
    }>(`query ShopifyConnectionTest {
      shop { name myshopifyDomain }
      locations(first: 20) { nodes { id name isActive } }
    }`);

    let scopes: string[] = [];
    try {
      const scopeResult = await shopifyGraphql<{
        currentAppInstallation?: { accessScopes: Array<{ handle: string }> };
      }>(`query ShopifyScopes { currentAppInstallation { accessScopes { handle } } }`);
      scopes = (scopeResult.data?.currentAppInstallation?.accessScopes || []).map((s) => s.handle);
    } catch {
      scopes = [];
    }

    const shop = result.data?.shop;
    const locations = (result.data?.locations?.nodes || []).filter((l) => l.isActive);
    const configured = shopifyConfiguredLocationId();
    const location = configured
      ? locations.find((l) => l.id === configured || l.id.endsWith(configured))
      : locations.length === 1 ? locations[0] : undefined;

    const missing = REQUIRED_SCOPES.filter((scope) => scopes.length > 0 && !scopes.includes(scope) && !scopes.includes(scope.replace('read_', 'write_')));
    const capabilities = [
      'product_create',
      'inventory_set',
      'media_upload',
      location ? 'location_configured' : 'location_unresolved',
    ];

    let message = `Connected to ${shop?.name || domain}.`;
    if (!location && locations.length > 1 && !configured) {
      message = 'Connected, but multiple Shopify locations exist. Set SHOPIFY_LOCATION_ID before publishing.';
    } else if (configured && !location) {
      message = 'Connected, but SHOPIFY_LOCATION_ID does not match an active location.';
    } else if (missing.length) {
      message = `Connected, but missing scopes: ${missing.join(', ')}`;
    }

    return json({
      connected: true,
      shopName: shop?.name,
      shopDomain: shop?.myshopifyDomain || domain,
      apiVersion: shopifyApiVersion(),
      locationName: location?.name,
      locationId: location?.id,
      scopes,
      capabilities,
      message,
    });
  } catch (err) {
    return json({
      connected: false,
      apiVersion: shopifyApiVersion(),
      message: sanitizeShopifyError(err instanceof Error ? err.message : 'Shopify connection test failed.'),
    }, 200);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
