export const DEFAULT_SHOPIFY_API_VERSION = '2026-07';

export function shopifyApiVersion(): string {
  return (Deno.env.get('SHOPIFY_API_VERSION') || DEFAULT_SHOPIFY_API_VERSION).trim();
}

export function shopifyStoreDomain(): string {
  return (Deno.env.get('SHOPIFY_STORE_DOMAIN') || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

export function shopifyAdminToken(): string {
  return (Deno.env.get('SHOPIFY_ADMIN_ACCESS_TOKEN') || '').trim();
}

export function shopifyClientId(): string {
  return (Deno.env.get('SHOPIFY_CLIENT_ID') || '').trim();
}

export function shopifyClientSecret(): string {
  return (Deno.env.get('SHOPIFY_CLIENT_SECRET') || '').trim();
}

export function shopifyCredentialsConfigured(): boolean {
  return Boolean(shopifyAdminToken() || (shopifyClientId() && shopifyClientSecret()));
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getShopifyAccessToken(): Promise<string> {
  const staticToken = shopifyAdminToken();
  if (staticToken) return staticToken;

  const clientId = shopifyClientId();
  const clientSecret = shopifyClientSecret();
  const domain = shopifyStoreDomain();
  if (!clientId || !clientSecret) {
    throw new Error('Missing Shopify Admin API credentials. Set SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.');
  }
  if (!domain) throw new Error('Missing Shopify store domain. Set SHOPIFY_STORE_DOMAIN.');
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;

  const resp = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(sanitizeShopifyError(`Shopify credential exchange failed (${resp.status}).`));
  }
  const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Shopify did not return an access token.');
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 86399) * 1000,
  };
  return cachedToken.token;
}

export function shopifyConfiguredLocationId(): string {
  return (Deno.env.get('SHOPIFY_LOCATION_ID') || '').trim();
}

export function shopifyConfiguredPublicationId(): string {
  return (Deno.env.get('SHOPIFY_PUBLICATION_ID') || '').trim();
}

export function sanitizeShopifyError(message: string): string {
  return String(message || 'Shopify request failed')
    .replace(/shpat_[a-zA-Z0-9]+/g, '[redacted]')
    .replace(/shpua_[a-zA-Z0-9]+/g, '[redacted]')
    .replace(/shpss_[a-zA-Z0-9]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/X-Shopify-Access-Token:\s*\S+/gi, '[redacted]')
    .replace(/client_secret=[^&\s]+/gi, 'client_secret=[redacted]');
}

export interface ShopifyGraphqlResult<T> {
  data?: T;
  errors?: Array<{ message: string }>;
  extensions?: {
    cost?: {
      throttleStatus?: {
        currentlyAvailable?: number;
        restoreRate?: number;
      };
    };
  };
}

export async function shopifyGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<ShopifyGraphqlResult<T>> {
  const domain = shopifyStoreDomain();
  const token = await getShopifyAccessToken();
  const version = shopifyApiVersion();
  if (!domain) throw new Error('Missing Shopify store domain. Set SHOPIFY_STORE_DOMAIN.');
  if (!token) throw new Error('Missing Shopify Admin API credentials. Set SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.');

  const resp = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await resp.text();
  if (resp.status === 429) {
    throw new Error('Shopify API throttled. Wait a moment and retry this listing.');
  }
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Shopify permission missing or credentials are invalid.');
    }
    throw new Error(sanitizeShopifyError(`Shopify HTTP ${resp.status}: ${text.slice(0, 300)}`));
  }

  const json = JSON.parse(text) as ShopifyGraphqlResult<T>;
  const available = json.extensions?.cost?.throttleStatus?.currentlyAvailable;
  if (typeof available === 'number' && available < 20) {
    await new Promise((r) => setTimeout(r, 800));
  }
  if (json.errors?.length) {
    throw new Error(sanitizeShopifyError(json.errors.map((e) => e.message).join('; ')));
  }
  return json;
}

export function userErrorsMessage(errors?: Array<{ field?: string[] | null; message?: string } | null> | null): string {
  if (!errors?.length) return '';
  return errors.map((e) => e?.message).filter(Boolean).join('; ');
}

export function gidNumeric(gid: string): string {
  return gid.includes('/') ? (gid.split('/').pop() || gid) : gid;
}

export function adminProductUrl(domain: string, productId: string): string {
  return `https://${domain}/admin/products/${gidNumeric(productId)}`;
}

export function storefrontProductUrl(domain: string, handle: string): string {
  return `https://${domain}/products/${handle}`;
}
