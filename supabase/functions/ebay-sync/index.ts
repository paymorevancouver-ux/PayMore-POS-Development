import { corsHeaders } from '../_shared/cors.ts';

const clientId = Deno.env.get('EBAY_CLIENT_ID')!;
const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET')!;

// eBay Sandbox vs Production — using Production
const EBAY_API_BASE = 'https://api.ebay.com';
const EBAY_AUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';

// --- Token Management ---
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  console.log('Fetching new eBay app token...');
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const resp = await fetch(EBAY_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('eBay auth error:', errText);
    throw new Error(`eBay auth failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  console.log('eBay token acquired, expires in', data.expires_in, 'seconds');
  return cachedToken.token;
}

// --- User Token (for listing management, requires user consent) ---
async function getUserToken(authCode: string, redirectUri: string): Promise<any> {
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const resp = await fetch(EBAY_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: `grant_type=authorization_code&code=${encodeURIComponent(authCode)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`eBay user auth failed (${resp.status}): ${errText}`);
  }

  return await resp.json();
}

async function refreshUserToken(refreshToken: string): Promise<any> {
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const resp = await fetch(EBAY_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&scope=https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment`,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`eBay token refresh failed (${resp.status}): ${errText}`);
  }

  return await resp.json();
}

// --- eBay Browse API (public search, uses app token) ---
async function searchEbayListings(query: string, limit = 20): Promise<any> {
  const token = await getAppToken();

  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    filter: 'conditionIds:{1000|1500|2000|2500|3000}',
  });

  const resp = await fetch(`${EBAY_API_BASE}/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_CA',
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`eBay search failed (${resp.status}): ${errText}`);
  }

  return await resp.json();
}

// --- Sell Inventory API (requires user token) ---
async function createInventoryItem(userToken: string, sku: string, itemData: any): Promise<any> {
  const resp = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${sku}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-CA',
    },
    body: JSON.stringify(itemData),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`eBay create inventory failed (${resp.status}): ${errText}`);
  }

  // 204 No Content = success
  if (resp.status === 204) return { success: true };
  return await resp.json();
}

async function createOffer(userToken: string, offerData: any): Promise<any> {
  const resp = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/offer`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-CA',
    },
    body: JSON.stringify(offerData),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`eBay create offer failed (${resp.status}): ${errText}`);
  }

  return await resp.json();
}

async function publishOffer(userToken: string, offerId: string): Promise<any> {
  const resp = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/publish`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`eBay publish offer failed (${resp.status}): ${errText}`);
  }

  return await resp.json();
}

async function getActiveListings(userToken: string, limit = 100, offset = 0): Promise<any> {
  const resp = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`,
    {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`eBay get listings failed (${resp.status}): ${errText}`);
  }

  return await resp.json();
}

async function deleteInventoryItem(userToken: string, sku: string): Promise<void> {
  const resp = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${sku}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${userToken}`,
    },
  });

  if (!resp.ok && resp.status !== 204) {
    const errText = await resp.text();
    throw new Error(`eBay delete item failed (${resp.status}): ${errText}`);
  }
}

async function getOffersBySkus(userToken: string, sku: string): Promise<any> {
  const resp = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, {
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`eBay get offers failed (${resp.status}): ${errText}`);
  }

  return await resp.json();
}

// --- Action Router ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    console.log('eBay Sync action:', action);

    switch (action) {
      // --- Get OAuth URL for user consent ---
      case 'get-auth-url': {
        const { redirectUri } = body;
        const scopes = encodeURIComponent(
          'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment'
        );
        const authUrl = `https://auth.ebay.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}`;

        return new Response(
          JSON.stringify({ success: true, authUrl }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // --- Exchange auth code for user token ---
      case 'exchange-token': {
        const { authCode, redirectUri } = body;
        const tokenData = await getUserToken(authCode, redirectUri);

        return new Response(
          JSON.stringify({
            success: true,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresIn: tokenData.expires_in,
            refreshTokenExpiresIn: tokenData.refresh_token_expires_in,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // --- Refresh user token ---
      case 'refresh-token': {
        const { refreshToken } = body;
        const tokenData = await refreshUserToken(refreshToken);

        return new Response(
          JSON.stringify({
            success: true,
            accessToken: tokenData.access_token,
            expiresIn: tokenData.expires_in,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // --- Search eBay (public, uses app token) ---
      case 'search': {
        const { query, limit } = body;
        const results = await searchEbayListings(query, limit || 20);

        return new Response(
          JSON.stringify({ success: true, results }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // --- List item on eBay ---
      case 'list-item': {
        const { userToken, sku, inventoryItem, offer } = body;

        // 1. Create/Update inventory item
        await createInventoryItem(userToken, sku, inventoryItem);
        console.log('Inventory item created/updated:', sku);

        // 2. Create offer
        const offerResult = await createOffer(userToken, offer);
        console.log('Offer created:', offerResult.offerId);

        // 3. Publish offer
        const publishResult = await publishOffer(userToken, offerResult.offerId);
        console.log('Offer published:', publishResult.listingId);

        return new Response(
          JSON.stringify({
            success: true,
            offerId: offerResult.offerId,
            listingId: publishResult.listingId,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // --- End/remove eBay listing ---
      case 'end-listing': {
        const { userToken, sku } = body;
        await deleteInventoryItem(userToken, sku);

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // --- Get active eBay listings ---
      case 'get-listings': {
        const { userToken, limit, offset } = body;
        const listings = await getActiveListings(userToken, limit || 100, offset || 0);

        return new Response(
          JSON.stringify({ success: true, listings }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // --- Get offers for SKU ---
      case 'get-offers': {
        const { userToken, sku } = body;
        const offers = await getOffersBySkus(userToken, sku);

        return new Response(
          JSON.stringify({ success: true, offers }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (err) {
    console.error('eBay Sync error:', err);
    return new Response(
      JSON.stringify({ error: `eBay: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
