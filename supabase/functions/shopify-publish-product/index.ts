import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  adminProductUrl,
  sanitizeShopifyError,
  shopifyApiVersion,
  shopifyConfiguredLocationId,
  shopifyConfiguredPublicationId,
  shopifyGraphql,
  shopifyStoreDomain,
  storefrontProductUrl,
  userErrorsMessage,
} from '../_shared/shopify.ts';
import {
  barcodeForShopify,
  descriptionToHtml,
  holdingComplete,
  isHttpUrl,
  parseDataUrl,
  publicMetafields,
  sanitizeTags,
} from '../_shared/shopify-payload.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '',
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, status: 'failed', message: 'POST required.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const listingId = String(body.listing_id || '').trim();
    const storeId = String(body.store_id || '').trim();
    const employeeId = String(body.employee_id || '').trim();
    const employeeName = String(body.employee_name || 'Unknown employee').trim();

    if (!listingId) return json({ success: false, status: 'validation_failed', message: 'listing_id is required.', issues: [{ field: 'listing_id', message: 'listing_id is required.' }] }, 400);

    const { data: employee } = employeeId
      ? await supabase.from('pos_employees').select('id, full_name, is_active, store_id').eq('id', employeeId).maybeSingle()
      : { data: null };
    if (!employee || employee.is_active === false) {
      return json({ success: false, status: 'validation_failed', message: 'A valid active employee must initiate publish.' }, 403);
    }

    const { data: listing, error: listingError } = await supabase
      .from('pos_shopify_listings')
      .select('*')
      .eq('id', listingId)
      .maybeSingle();
    if (listingError || !listing) {
      return json({ success: false, status: 'validation_failed', message: 'Listing does not exist.' }, 404);
    }
    if (storeId && listing.store_id !== storeId) {
      return json({ success: false, status: 'validation_failed', message: 'Listing does not belong to this store.' }, 403);
    }
    if (employee.store_id && listing.store_id && employee.store_id !== listing.store_id) {
      return json({ success: false, status: 'validation_failed', message: 'Employee does not belong to this store.' }, 403);
    }

    if (listing.status === 'active' && listing.shopify_product_id) {
      return json({
        success: true,
        status: 'already_published',
        listingStatus: 'active',
        message: 'Already published',
        shopifyProductId: listing.shopify_product_id,
        shopifyVariantId: listing.shopify_variant_id,
        shopifyInventoryItemId: listing.shopify_inventory_item_id,
        shopifyHandle: listing.shopify_handle,
        shopifyAdminUrl: listing.shopify_admin_url || listing.shopify_url,
        shopifyStorefrontUrl: listing.shopify_storefront_url,
        shopifyUrl: listing.shopify_url,
      });
    }
    if (listing.status === 'publishing') {
      return json({ success: false, status: 'already_publishing', listingStatus: 'publishing', message: 'This listing is already publishing.' }, 409);
    }

    const { data: inventory } = await supabase
      .from('pos_inventory')
      .select('*')
      .eq('id', listing.inventory_item_id)
      .maybeSingle();

    const { data: settings } = await supabase
      .from('pos_settings')
      .select('value')
      .eq('store_id', listing.store_id)
      .eq('key', 'holding_period_days')
      .maybeSingle();
    const holdingDays = Number(settings?.value || 0) || 0;

    const issues = validateListing(listing, inventory, holdingDays);
    const { data: otherActive } = await supabase
      .from('pos_shopify_listings')
      .select('id, status')
      .eq('store_id', listing.store_id)
      .eq('inventory_item_id', listing.inventory_item_id)
      .neq('id', listing.id)
      .in('status', ['publishing', 'active']);
    if (otherActive?.length) {
      issues.push({ field: 'duplicate', message: 'An active Shopify listing already exists for this inventory item.' });
    }
    if (issues.length) {
      return json({ success: false, status: 'validation_failed', message: issues[0].message, issues }, 422);
    }

    const claimed = await claimPublishing(supabase, listing);
    if (!claimed.ok) {
      return json({ success: false, status: claimed.status, listingStatus: claimed.listingStatus, message: claimed.message }, claimed.http);
    }

    await writeAudit(supabase, listing.store_id, employee.id, employee.full_name || employeeName, listing, inventory, 'SHOPIFY_PUBLISH_STARTED', listing.shopify_product_id ? 'Retry started' : 'Publish started');

    const result = await publishToShopify(supabase, claimed.listing, inventory, employee.id, employee.full_name || employeeName);
    return json(result, result.success || result.status === 'already_published' ? 200 : 422);
  } catch (err) {
    return json({
      success: false,
      status: 'failed',
      message: sanitizeShopifyError(err instanceof Error ? err.message : 'Shopify publish failed.'),
    }, 500);
  }
});

function validateListing(listing: Record<string, unknown>, inventory: Record<string, unknown> | null, holdingDays: number) {
  const issues: Array<{ field: string; message: string }> = [];
  if (!['ready', 'error'].includes(String(listing.status))) {
    issues.push({ field: 'status', message: `Listing status ${listing.status} cannot be published.` });
  }
  if (!String(listing.title || '').trim()) issues.push({ field: 'title', message: 'Title is required.' });
  if (!(Number(listing.price) > 0)) issues.push({ field: 'price', message: 'Price must be greater than 0.' });
  if (!(Number(listing.quantity) > 0)) issues.push({ field: 'quantity', message: 'Listing quantity must be greater than 0.' });
  if (!String(listing.shopify_vendor || '').trim()) issues.push({ field: 'vendor', message: 'Vendor is required.' });
  if (!String(listing.shopify_product_type || '').trim()) issues.push({ field: 'productType', message: 'Product type is required.' });
  if (!String(listing.condition || '').trim()) issues.push({ field: 'condition', message: 'Condition is required.' });
  if (!inventory) {
    issues.push({ field: 'inventory', message: 'Inventory item does not exist.' });
    return issues;
  }
  const onHand = Number(inventory.quantity_on_hand || 0);
  if (!(onHand > 0)) issues.push({ field: 'quantity_on_hand', message: 'POS quantity on hand must be greater than 0.' });
  if (Number(listing.quantity) > onHand) issues.push({ field: 'quantity', message: 'Listing quantity cannot exceed POS quantity on hand.' });
  if (inventory.status === 'sold') issues.push({ field: 'inventory', message: 'Inventory item is sold.' });
  if (inventory.status === 'scrapped') issues.push({ field: 'inventory', message: 'Inventory item is scrapped.' });
  if (!holdingComplete(String(inventory.acquired_at || ''), holdingDays)) {
    issues.push({ field: 'holding', message: 'Holding period is not complete.' });
  }
  return issues;
}

async function claimPublishing(client: SupabaseClient, listing: Record<string, unknown>) {
  const attempts = Number(listing.publish_attempts || 0) + 1;
  const now = new Date().toISOString();
  const fullPatch = {
    status: 'publishing',
    last_error: null,
    last_publish_attempt_at: now,
    publish_attempts: attempts,
    updated_at: now,
  };
  let { data, error } = await client
    .from('pos_shopify_listings')
    .update(fullPatch)
    .eq('id', listing.id)
    .in('status', ['ready', 'error'])
    .select('*')
    .maybeSingle();
  if (error) {
    const retry = await client
      .from('pos_shopify_listings')
      .update({ status: 'publishing', last_error: null, updated_at: now })
      .eq('id', listing.id)
      .in('status', ['ready', 'error'])
      .select('*')
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return { ok: false as const, status: 'failed', listingStatus: String(listing.status), message: 'Could not claim listing for publishing.', http: 409 };
  }
  if (!data) {
    if (listing.status === 'publishing') {
      return { ok: false as const, status: 'already_publishing', listingStatus: 'publishing', message: 'This listing is already publishing.', http: 409 };
    }
    if (listing.status === 'active') {
      return { ok: false as const, status: 'already_published', listingStatus: 'active', message: 'Already published', http: 200 };
    }
    return { ok: false as const, status: 'validation_failed', listingStatus: String(listing.status), message: 'Listing must be Ready before publishing.', http: 409 };
  }
  return { ok: true as const, listing: data };
}

async function resolveLocation(): Promise<{ id: string; name?: string }> {
  const configured = shopifyConfiguredLocationId();
  const result = await shopifyGraphql<{ locations: { nodes: Array<{ id: string; name: string; isActive: boolean }> } }>(
    `query Locations { locations(first: 25) { nodes { id name isActive } } }`,
  );
  const active = (result.data?.locations?.nodes || []).filter((l) => l.isActive);
  if (configured) {
    const match = active.find((l) => l.id === configured || l.id.endsWith(configured) || configured.endsWith(gidTail(l.id)));
    if (!match) throw new Error('Configured Shopify location was not found. Check SHOPIFY_LOCATION_ID.');
    return match;
  }
  if (active.length === 1) return active[0];
  if (active.length === 0) throw new Error('No active Shopify location was found.');
  throw new Error('Multiple Shopify locations exist. Set SHOPIFY_LOCATION_ID before publishing.');
}

async function publishToShopify(
  client: SupabaseClient,
  listing: Record<string, unknown>,
  inventory: Record<string, unknown>,
  employeeId: string,
  employeeName: string,
) {
  const domain = shopifyStoreDomain();
  const warnings: string[] = [];
  const location = await resolveLocation();
  const qty = Math.min(Number(listing.quantity || 1), Number(inventory.quantity_on_hand || 1));
  const sku = String(listing.sku || inventory.device_code || '').trim();
  const barcode = barcodeForShopify(String(listing.barcode || ''));
  let productId = String(listing.shopify_product_id || '');
  let variantId = String(listing.shopify_variant_id || '');
  let inventoryItemId = String(listing.shopify_inventory_item_id || '');
  let handle = String(listing.shopify_handle || '');

  try {
    if (productId) {
      const existing = await fetchProduct(productId);
      if (!existing) throw new Error('Existing Shopify product could not be loaded. Confirm the product still exists.');
      productId = existing.id;
      variantId = existing.variantId || variantId;
      inventoryItemId = existing.inventoryItemId || inventoryItemId;
      handle = existing.handle || handle;
      await writeAudit(client, String(listing.store_id), employeeId, employeeName, listing, inventory, 'SHOPIFY_PUBLISH_RETRY', `Continuing existing product ${productId}`);
    } else {
      const created = await createProduct(listing, sku, barcode);
      productId = created.productId;
      variantId = created.variantId;
      inventoryItemId = created.inventoryItemId;
      handle = created.handle;
      await persistIds(client, listing, { productId, variantId, inventoryItemId, handle, locationId: location.id });
      await writeAudit(client, String(listing.store_id), employeeId, employeeName, listing, inventory, 'SHOPIFY_PRODUCT_CREATED', productId);
    }

    await persistIds(client, listing, { productId, variantId, inventoryItemId, handle, locationId: location.id });

    if (productId && listing.shopify_product_id) {
      await updateExistingProduct(listing, productId, variantId, sku, barcode);
    }

    if (inventoryItemId) {
      await activateInventory(inventoryItemId, location.id, String(listing.id));
      await setInventory(inventoryItemId, location.id, qty, String(listing.id));
      const verified = await verifyInventory(inventoryItemId, location.id, qty);
      if (!verified) warnings.push('Inventory was set, but Shopify quantity could not be verified.');
    }

    const photoWarning = await attachPhotos(productId, Array.isArray(listing.photos) ? listing.photos as string[] : [], String(listing.title || 'Product'));
    if (photoWarning) warnings.push(photoWarning);

    await setMetafields(productId, listing);
    await activateProduct(productId);
    const publishedToStore = await publishToOnlineStore(productId, warnings);

    const adminUrl = adminProductUrl(domain, productId);
    const storefrontUrl = publishedToStore && handle ? storefrontProductUrl(domain, handle) : '';
    const now = new Date().toISOString();
    await updateListingSafe(client, String(listing.id), {
      status: 'active',
      shopify_product_id: productId,
      shopify_variant_id: variantId || null,
      shopify_inventory_item_id: inventoryItemId || null,
      shopify_handle: handle || null,
      shopify_url: adminUrl,
      shopify_admin_url: adminUrl,
      shopify_storefront_url: storefrontUrl || null,
      shopify_location_id: location.id,
      publish_warning: warnings[0] || null,
      last_error: null,
      published_at: listing.published_at || now,
      last_synced_at: now,
      updated_at: now,
    });
    await writeAudit(client, String(listing.store_id), employeeId, employeeName, listing, inventory, 'SHOPIFY_PUBLISH_SUCCESS', productId);

    return {
      success: true,
      status: 'published',
      listingStatus: 'active',
      message: warnings.length ? `Published with warnings: ${warnings.join(' ')}` : 'Published to Shopify.',
      shopifyProductId: productId,
      shopifyVariantId: variantId,
      shopifyInventoryItemId: inventoryItemId,
      shopifyHandle: handle,
      shopifyAdminUrl: adminUrl,
      shopifyStorefrontUrl: storefrontUrl,
      shopifyUrl: adminUrl,
      warnings,
    };
  } catch (err) {
    const message = sanitizeShopifyError(err instanceof Error ? err.message : 'Shopify publish failed.');
    await updateListingSafe(client, String(listing.id), {
      status: 'error',
      last_error: message,
      shopify_product_id: productId || listing.shopify_product_id || null,
      shopify_variant_id: variantId || listing.shopify_variant_id || null,
      shopify_inventory_item_id: inventoryItemId || listing.shopify_inventory_item_id || null,
      shopify_handle: handle || listing.shopify_handle || null,
      shopify_url: productId ? adminProductUrl(domain, productId) : listing.shopify_url || null,
      updated_at: new Date().toISOString(),
    });
    await writeAudit(client, String(listing.store_id), employeeId, employeeName, listing, inventory, 'SHOPIFY_PUBLISH_FAILED', message);
    return {
      success: false,
      status: 'failed',
      listingStatus: 'error',
      message,
      shopifyProductId: productId || undefined,
      shopifyVariantId: variantId || undefined,
      shopifyInventoryItemId: inventoryItemId || undefined,
      shopifyHandle: handle || undefined,
      warnings,
    };
  }
}

async function createProduct(listing: Record<string, unknown>, sku: string, barcode: string) {
  const result = await shopifyGraphql<{
    productSet: {
      product?: {
        id: string;
        handle: string;
        variants?: { nodes: Array<{ id: string; sku?: string; inventoryItem?: { id: string } }> };
      };
      userErrors?: Array<{ field?: string[]; message: string }>;
    };
  }>(`mutation ProductSet($input: ProductSetInput!, $synchronous: Boolean) {
    productSet(input: $input, synchronous: $synchronous) {
      product {
        id
        handle
        variants(first: 5) {
          nodes { id sku inventoryItem { id } }
        }
      }
      userErrors { field message }
    }
  }`, {
    synchronous: true,
    input: {
      title: String(listing.title),
      descriptionHtml: descriptionToHtml(String(listing.description || '')),
      vendor: String(listing.shopify_vendor || ''),
      productType: String(listing.shopify_product_type || ''),
      tags: sanitizeTags(listing.tags),
      status: 'DRAFT',
      productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
      variants: [{
        optionValues: [{ optionName: 'Title', name: 'Default Title' }],
        price: String(Number(listing.price).toFixed(2)),
        compareAtPrice: listing.compare_at_price != null && Number(listing.compare_at_price) > 0
          ? String(Number(listing.compare_at_price).toFixed(2))
          : undefined,
        barcode: barcode || undefined,
        inventoryPolicy: 'DENY',
        inventoryItem: { tracked: true, sku },
      }],
    },
  });

  const err = userErrorsMessage(result.data?.productSet?.userErrors);
  if (err) throw new Error(err);
  const product = result.data?.productSet?.product;
  const variant = product?.variants?.nodes?.[0];
  if (!product?.id) throw new Error('Shopify did not return a product ID.');
  return {
    productId: product.id,
    variantId: variant?.id || '',
    inventoryItemId: variant?.inventoryItem?.id || '',
    handle: product.handle || '',
  };
}

async function fetchProduct(id: string) {
  const result = await shopifyGraphql<{
    product: {
      id: string;
      handle: string;
      variants?: { nodes: Array<{ id: string; inventoryItem?: { id: string } }> };
    } | null;
  }>(`query Product($id: ID!) {
    product(id: $id) {
      id
      handle
      variants(first: 5) { nodes { id inventoryItem { id } } }
    }
  }`, { id });
  const product = result.data?.product;
  if (!product) return null;
  return {
    id: product.id,
    handle: product.handle,
    variantId: product.variants?.nodes?.[0]?.id || '',
    inventoryItemId: product.variants?.nodes?.[0]?.inventoryItem?.id || '',
  };
}

async function updateExistingProduct(
  listing: Record<string, unknown>,
  productId: string,
  variantId: string,
  sku: string,
  barcode: string,
) {
  const result = await shopifyGraphql<{
    productSet: { userErrors?: Array<{ message: string }> };
  }>(`mutation ProductReconcile($input: ProductSetInput!, $synchronous: Boolean) {
    productSet(input: $input, synchronous: $synchronous) {
      userErrors { field message }
    }
  }`, {
    synchronous: true,
    input: {
      id: productId,
      title: String(listing.title),
      descriptionHtml: descriptionToHtml(String(listing.description || '')),
      vendor: String(listing.shopify_vendor || ''),
      productType: String(listing.shopify_product_type || ''),
      tags: sanitizeTags(listing.tags),
      variants: variantId ? [{
        id: variantId,
        price: String(Number(listing.price).toFixed(2)),
        compareAtPrice: listing.compare_at_price != null && Number(listing.compare_at_price) > 0
          ? String(Number(listing.compare_at_price).toFixed(2))
          : undefined,
        barcode: barcode || undefined,
        inventoryItem: { tracked: true, sku },
      }] : undefined,
    },
  });
  const err = userErrorsMessage(result.data?.productSet?.userErrors);
  if (err) throw new Error(`Invalid product data: ${err}`);
}

async function activateInventory(inventoryItemId: string, locationId: string, listingId: string) {
  try {
    const result = await shopifyGraphql<{
      inventoryActivate: { userErrors?: Array<{ message: string }> };
    }>(`mutation ActivateInv($inventoryItemId: ID!, $locationId: ID!, $idempotencyKey: String!) {
      inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) @idempotent(key: $idempotencyKey) {
        userErrors { field message }
      }
    }`, {
      inventoryItemId,
      locationId,
      idempotencyKey: `pos-activate-${listingId}-${inventoryItemId}-${locationId}`,
    });
    const err = userErrorsMessage(result.data?.inventoryActivate?.userErrors);
    if (err && !/already.+activ/i.test(err)) {
      throw new Error(`Inventory update failed: ${err}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/already.+activ/i.test(message)) return;
    throw err;
  }
}

async function setInventory(inventoryItemId: string, locationId: string, quantity: number, listingId: string) {
  const result = await shopifyGraphql<{
    inventorySetQuantities: { userErrors?: Array<{ message: string }> };
  }>(`mutation SetQty($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      userErrors { field message }
    }
  }`, {
    idempotencyKey: `pos-setqty-${listingId}-${inventoryItemId}-${quantity}`,
    input: {
      name: 'available',
      reason: 'correction',
      referenceDocumentUri: `gid://paymore/ShopifyListing/${listingId}`,
      quantities: [{
        inventoryItemId,
        locationId,
        quantity,
        changeFromQuantity: null,
      }],
    },
  });
  const err = userErrorsMessage(result.data?.inventorySetQuantities?.userErrors);
  if (err) throw new Error(`Inventory update failed: ${err}`);
}

async function verifyInventory(inventoryItemId: string, locationId: string, expected: number): Promise<boolean> {
  try {
    const result = await shopifyGraphql<{
      inventoryItem?: {
        inventoryLevels?: {
          nodes: Array<{ location?: { id: string }; quantities?: Array<{ name: string; quantity: number }> }>;
        };
      };
    }>(`query VerifyQty($id: ID!) {
      inventoryItem(id: $id) {
        inventoryLevels(first: 20) {
          nodes {
            location { id }
            quantities(names: ["available"]) { name quantity }
          }
        }
      }
    }`, { id: inventoryItemId });
    const level = result.data?.inventoryItem?.inventoryLevels?.nodes.find((node) => node.location?.id === locationId);
    const available = level?.quantities?.find((q) => q.name === 'available')?.quantity;
    return available === expected;
  } catch {
    return false;
  }
}

async function attachPhotos(productId: string, photos: string[], alt: string): Promise<string | null> {
  const expected = photos.filter((p) => typeof p === 'string' && p.trim());
  if (expected.length === 0) return null;

  const existing = await shopifyGraphql<{ product: { media?: { nodes: Array<{ id: string }> } } }>(
    `query Media($id: ID!) { product(id: $id) { media(first: 30) { nodes { id } } } }`,
    { id: productId },
  );
  if ((existing.data?.product?.media?.nodes.length || 0) >= expected.length) return null;

  let succeeded = 0;
  const failures: string[] = [];
  for (let i = 0; i < expected.length; i++) {
    try {
      const source = await resolveMediaSource(expected[i], i);
      const result = await shopifyGraphql<{
        productCreateMedia: { mediaUserErrors?: Array<{ message: string }>; media?: Array<{ id?: string }> };
      }>(`mutation AddMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { ... on MediaImage { id status } }
          mediaUserErrors { field message }
        }
      }`, {
        productId,
        media: [{ originalSource: source, mediaContentType: 'IMAGE', alt: `${alt} ${i + 1}` }],
      });
      const err = userErrorsMessage(result.data?.productCreateMedia?.mediaUserErrors);
      if (err) throw new Error(err);
      succeeded += 1;
    } catch (err) {
      failures.push(`Image ${i + 1}: ${sanitizeShopifyError(err instanceof Error ? err.message : 'failed')}`);
    }
  }

  if (succeeded === 0) throw new Error(`Image could not be downloaded. ${failures.join('; ')}`);
  if (failures.length) return `Some images failed: ${failures.join('; ')}`;
  return null;
}

async function resolveMediaSource(photo: string, index: number): Promise<string> {
  if (isHttpUrl(photo)) return photo;
  const parsed = parseDataUrl(photo);
  if (!parsed) throw new Error('Unsupported image format.');
  const staged = await shopifyGraphql<{
    stagedUploadsCreate: {
      stagedTargets?: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>;
      userErrors?: Array<{ message: string }>;
    };
  }>(`mutation Stage($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`, {
    input: [{
      filename: parsed.filename.replace('.', `-${index}.`),
      mimeType: parsed.mime,
      httpMethod: 'POST',
      resource: 'PRODUCT_IMAGE',
      fileSize: String(parsed.bytes.length),
    }],
  });
  const err = userErrorsMessage(staged.data?.stagedUploadsCreate?.userErrors);
  if (err) throw new Error(err);
  const target = staged.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url || !target.resourceUrl) throw new Error('Shopify staged upload was not created.');

  const form = new FormData();
  for (const param of target.parameters || []) form.append(param.name, param.value);
  form.append('file', new Blob([parsed.bytes], { type: parsed.mime }), parsed.filename);
  const upload = await fetch(target.url, { method: 'POST', body: form });
  if (!upload.ok) throw new Error(`Image could not be uploaded (${upload.status}).`);
  return target.resourceUrl;
}

async function setMetafields(productId: string, listing: Record<string, unknown>) {
  const fields = publicMetafields(
    (listing.attributes && typeof listing.attributes === 'object') ? listing.attributes as Record<string, unknown> : {},
    String(listing.condition || ''),
  );
  if (!fields.length) return;
  const result = await shopifyGraphql<{ metafieldsSet: { userErrors?: Array<{ message: string }> } }>(
    `mutation Meta($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { field message } }
    }`,
    {
      metafields: fields.map((field) => ({
        ownerId: productId,
        namespace: field.namespace,
        key: field.key,
        type: field.type,
        value: field.value,
      })),
    },
  );
  const err = userErrorsMessage(result.data?.metafieldsSet?.userErrors);
  if (err) throw new Error(`Invalid product data: ${err}`);
}

async function activateProduct(productId: string) {
  const result = await shopifyGraphql<{
    productUpdate: { userErrors?: Array<{ message: string }> };
  }>(`mutation Activate($product: ProductUpdateInput!) {
    productUpdate(product: $product) { userErrors { field message } }
  }`, { product: { id: productId, status: 'ACTIVE' } });
  const err = userErrorsMessage(result.data?.productUpdate?.userErrors);
  if (err) {
    const fallback = await shopifyGraphql<{ productSet: { userErrors?: Array<{ message: string }> } }>(
      `mutation ActivateSet($input: ProductSetInput!) {
        productSet(input: $input) { userErrors { field message } }
      }`,
      { input: { id: productId, status: 'ACTIVE' } },
    );
    const fallbackErr = userErrorsMessage(fallback.data?.productSet?.userErrors);
    if (fallbackErr) throw new Error(fallbackErr);
  }
}

async function publishToOnlineStore(productId: string, warnings: string[]): Promise<boolean> {
  try {
    const configured = shopifyConfiguredPublicationId();
    let publicationId = configured;
    if (!publicationId) {
      const pubs = await shopifyGraphql<{ publications: { nodes: Array<{ id: string; name: string }> } }>(
        `query Pubs { publications(first: 20) { nodes { id name } } }`,
      );
      const online = (pubs.data?.publications?.nodes || []).find((p) => /online store/i.test(p.name));
      publicationId = online?.id || '';
    }
    if (!publicationId) {
      warnings.push('Product is ACTIVE but Online Store publication was not found. Set SHOPIFY_PUBLICATION_ID or grant publication scopes.');
      return false;
    }
    const result = await shopifyGraphql<{ publishablePublish: { userErrors?: Array<{ message: string }> } }>(
      `mutation Pub($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { field message } }
      }`,
      { id: productId, input: [{ publicationId }] },
    );
    const err = userErrorsMessage(result.data?.publishablePublish?.userErrors);
    if (err) {
      warnings.push(`Online Store publication failed: ${err}`);
      return false;
    }
    return true;
  } catch (err) {
    warnings.push(`Online Store publication requires additional scopes or SHOPIFY_PUBLICATION_ID. ${sanitizeShopifyError(err instanceof Error ? err.message : '')}`);
    return false;
  }
}

async function persistIds(
  client: SupabaseClient,
  listing: Record<string, unknown>,
  ids: { productId: string; variantId: string; inventoryItemId: string; handle: string; locationId: string },
) {
  await updateListingSafe(client, String(listing.id), {
    shopify_product_id: ids.productId,
    shopify_variant_id: ids.variantId || null,
    shopify_inventory_item_id: ids.inventoryItemId || null,
    shopify_handle: ids.handle || null,
    shopify_location_id: ids.locationId,
    shopify_url: adminProductUrl(shopifyStoreDomain(), ids.productId),
    shopify_admin_url: adminProductUrl(shopifyStoreDomain(), ids.productId),
    updated_at: new Date().toISOString(),
  });
}

async function updateListingSafe(client: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const first = await client.from('pos_shopify_listings').update(patch).eq('id', id);
  if (!first.error) return;
  const fallback = { ...patch };
  delete fallback.shopify_admin_url;
  delete fallback.shopify_storefront_url;
  delete fallback.publish_attempts;
  delete fallback.last_publish_attempt_at;
  delete fallback.publish_warning;
  delete fallback.shopify_location_id;
  const second = await client.from('pos_shopify_listings').update(fallback).eq('id', id);
  if (second.error) console.error('[shopify-publish] update failed', second.error.message);
}

async function writeAudit(
  client: SupabaseClient,
  storeId: string,
  employeeId: string,
  employeeName: string,
  listing: Record<string, unknown>,
  inventory: Record<string, unknown> | null,
  action: string,
  details: string,
) {
  await client.from('pos_audit_log').insert({
    id: `AUD-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    store_id: storeId,
    actor_employee_id: employeeId,
    actor_name: employeeName,
    module: 'shopify-lister',
    action,
    record_type: 'shopify_listing',
    record_id: String(listing.id),
    details: `${details} | listing=${listing.id} inventory=${listing.inventory_item_id} device=${inventory?.device_code || listing.sku || ''}`.slice(0, 500),
    created_at: new Date().toISOString(),
  });
}

function gidTail(id: string): string {
  return id.includes('/') ? (id.split('/').pop() || id) : id;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ apiVersion: shopifyApiVersion(), ...body }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
