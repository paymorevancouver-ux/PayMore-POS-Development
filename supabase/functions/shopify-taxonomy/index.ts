import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sanitizeShopifyError, shopifyGraphql } from '../_shared/shopify.ts';
import { isShopifyTaxonomyCategoryId } from '../_shared/shopify-payload.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '',
);

const cache = new Map<string, { expiresAt: number; payload: unknown }>();
const CACHE_MS = 10 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cached(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

function setCache(key: string, payload: unknown) {
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, payload });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'POST required.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const employeeId = String(body.employee_id || '').trim();
    const { data: employee } = employeeId
      ? await supabase.from('pos_employees').select('id, is_active').eq('id', employeeId).maybeSingle()
      : { data: null };
    if (!employee || employee.is_active === false) {
      return json({ success: false, error: 'A valid employee must search Shopify categories.' }, 403);
    }

    const action = String(body.action || 'search').trim();
    if (action === 'search') return await handleSearch(String(body.query || body.search || ''));
    if (action === 'get') return await handleGet(String(body.id || ''));
    if (action === 'suggest') return await handleSuggest(body);
    return json({ success: false, error: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('[shopify-taxonomy]', err);
    return json({
      success: false,
      error: sanitizeShopifyError(err instanceof Error ? err.message : 'Unable to load Shopify categories.'),
      message: 'Unable to load Shopify categories.',
    }, 502);
  }
});

async function handleSearch(query: string) {
  const search = query.trim();
  if (search.length < 2) return json({ success: true, categories: [] });
  const key = `search:${search.toLowerCase()}`;
  const hit = cached(key);
  if (hit) return json(hit);

  const result = await shopifyGraphql<{
    taxonomy?: {
      categories?: {
        nodes: Array<{ id: string; name: string; fullName: string; isLeaf?: boolean; isRoot?: boolean; level?: number }>;
      };
    };
  }>(`query TaxonomySearch($search: String!) {
    taxonomy {
      categories(first: 20, search: $search) {
        nodes { id name fullName isLeaf isRoot level }
      }
    }
  }`, { search });

  const categories = (result.data?.taxonomy?.categories?.nodes || []).filter((row) => isShopifyTaxonomyCategoryId(row.id));
  const payload = { success: true, categories };
  setCache(key, payload);
  return json(payload);
}

async function handleGet(id: string) {
  if (!isShopifyTaxonomyCategoryId(id)) {
    return json({ success: false, error: 'Shopify category must be a real TaxonomyCategory ID.' }, 400);
  }
  const key = `get:${id}`;
  const hit = cached(key);
  if (hit) return json(hit);

  const result = await shopifyGraphql<{
    node?: {
      id: string;
      name: string;
      fullName: string;
      isLeaf?: boolean;
      attributes?: { nodes: Array<{ id?: string; name?: string; handle?: string }> };
    } | null;
  }>(`query TaxonomyCategory($id: ID!) {
    node(id: $id) {
      ... on TaxonomyCategory {
        id
        name
        fullName
        isLeaf
        attributes(first: 50) {
          nodes {
            ... on TaxonomyChoiceListAttribute { id name handle }
            ... on TaxonomyMeasurementAttribute { id name handle }
          }
        }
      }
    }
  }`, { id });

  const node = result.data?.node;
  if (!node?.id) return json({ success: false, error: 'Shopify category was not found.' }, 404);
  const payload = {
    success: true,
    category: {
      id: node.id,
      name: node.name,
      fullName: node.fullName,
      isLeaf: node.isLeaf,
    },
    attributes: (node.attributes?.nodes || []).map((attr) => ({
      id: attr.id || '',
      name: attr.name || '',
      handle: attr.handle || '',
    })).filter((attr) => attr.id || attr.name),
  };
  setCache(key, payload);
  return json(payload);
}

async function handleSuggest(body: Record<string, unknown>) {
  const terms = Array.isArray(body.search_terms)
    ? body.search_terms.map((term) => String(term || '').trim()).filter(Boolean)
    : [String(body.query || '').trim()].filter(Boolean);
  if (!terms.length) return json({ success: true, category: null, categories: [] });

  let categories: Array<{ id: string; name: string; fullName: string; isLeaf?: boolean }> = [];
  for (const term of terms) {
    const result = await handleSearch(term);
    const parsed = await result.json() as { success?: boolean; categories?: typeof categories };
    if (parsed.categories?.length) {
      categories = parsed.categories;
      break;
    }
  }
  const suggested = categories.find((row) => row.isLeaf !== false) || categories[0] || null;
  return json({ success: true, category: suggested, categories });
}
