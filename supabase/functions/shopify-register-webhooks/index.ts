import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  sanitizeShopifyError,
  shopifyGraphql,
  shopifyStoreDomain,
  userErrorsMessage,
} from '../_shared/shopify.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '',
);

const TOPICS = ['ORDERS_PAID', 'ORDERS_CANCELLED', 'REFUNDS_CREATE'] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function callbackUrl(): string {
  const configured = (Deno.env.get('SHOPIFY_WEBHOOK_CALLBACK_URL') || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  return `${supabaseUrl}/functions/v1/shopify-order-webhook`;
}

async function subscribe(topic: string, uri: string) {
  const result = await shopifyGraphql<{
    webhookSubscriptionCreate?: {
      webhookSubscription?: { id?: string; topic?: string; uri?: string; callbackUrl?: string };
      userErrors?: Array<{ field?: string[]; message?: string }>;
    };
  }>(`mutation Register($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }`, {
    topic,
    webhookSubscription: {
      callbackUrl: uri,
      format: 'JSON',
    },
  });
  const created = result.data?.webhookSubscriptionCreate;
  const err = userErrorsMessage(created?.userErrors);
  if (err && /uri|callbackUrl/i.test(err)) {
    const fallback = await shopifyGraphql<{
      webhookSubscriptionCreate?: {
        webhookSubscription?: { id?: string; topic?: string; uri?: string };
        userErrors?: Array<{ field?: string[]; message?: string }>;
      };
    }>(`mutation RegisterUri($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription { id topic uri }
        userErrors { field message }
      }
    }`, {
      topic,
      webhookSubscription: {
        uri,
        format: 'JSON',
      },
    });
    const fallbackErr = userErrorsMessage(fallback.data?.webhookSubscriptionCreate?.userErrors);
    if (fallbackErr) throw new Error(`${topic}: ${fallbackErr}`);
    return fallback.data?.webhookSubscriptionCreate?.webhookSubscription;
  }
  if (err) throw new Error(`${topic}: ${err}`);
  return created?.webhookSubscription;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'POST required.' }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const employeeId = String(body.employee_id || '').trim();
    const { data: employee } = employeeId
      ? await supabase.from('pos_employees').select('id, is_active').eq('id', employeeId).maybeSingle()
      : { data: null };
    if (!employee || employee.is_active === false) {
      return json({ success: false, error: 'A valid active employee must register Shopify webhooks.' }, 403);
    }

    const uri = callbackUrl();
    const subscriptions = [];
    const errors: string[] = [];
    for (const topic of TOPICS) {
      try {
        const created = await subscribe(topic, uri);
        subscriptions.push({
          topic,
          id: created?.id || null,
          callbackUrl: created?.uri || created?.callbackUrl || uri,
        });
      } catch (err) {
        errors.push(sanitizeShopifyError(err instanceof Error ? err.message : String(err)));
      }
    }

    return json({
      success: errors.length === 0,
      shopDomain: shopifyStoreDomain(),
      callbackUrl: uri,
      topics: TOPICS,
      subscriptions,
      errors,
      requiredScopes: ['read_orders', 'read_products', 'write_products', 'read_inventory', 'write_inventory'],
      deployNote: 'shopify-order-webhook must be deployed with JWT verification disabled: npx supabase functions deploy shopify-order-webhook --no-verify-jwt',
    });
  } catch (err) {
    return json({
      success: false,
      error: sanitizeShopifyError(err instanceof Error ? err.message : 'Webhook registration failed.'),
    }, 200);
  }
});
