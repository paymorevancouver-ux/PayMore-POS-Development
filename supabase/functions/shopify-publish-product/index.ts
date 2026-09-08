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
  approvedDescriptionHtml,
  buildCategorySetPayload,
  buildDescriptionSetPayload,
  buildProductCreatePayload,
  buildProductUpdatePayload,
  buildVariantUpdatePayload,
  categoryIdsMatch,
  categoryMetafields,
  chooseInitialVariant,
  costsMatch,
  descriptionVerificationIssue,
  holdingComplete,
  isHttpUrl,
  listingHasConfirmedTaxonomy,
  listingPhotoAssets,
  parseDataUrl,
    photoSourceKind,
    productSetCategory,
    publicMetafields,
    publishStepError,
    shopifyCategoryRequiredMessage,
    skuLookupDecision,
    unexpectedVariantCountMessage,
} from '../_shared/shopify-payload.ts';
import {
  BARCODE_MISMATCH_MESSAGE,
  barcodeForShopify,
  detectBarcodeMismatch,
  generateRetailBarcode,
  inventoryItemCostUpdateInput,
  resolveExistingBarcode,
} from '../_shared/shopify-barcode.ts';

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
        barcode: listing.barcode,
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
    if (!inventory) {
      return json({ success: false, status: 'validation_failed', message: 'Inventory item does not exist.' }, 422);
    }

    const claimed = await claimPublishing(supabase, listing);
    if (!claimed.ok) {
      return json({ success: false, status: claimed.status, listingStatus: claimed.listingStatus, message: claimed.message }, claimed.http);
    }

    const barcodeReady = await resolveAndPersistBarcode(
      supabase,
      claimed.listing,
      inventory,
      employee.id,
      employee.full_name || employeeName,
    );
    if (!barcodeReady.ok) {
      await failListing(supabase, claimed.listing, publishStepError('RESOLVE_BARCODE', barcodeReady.message));
      return json({
        success: false,
        status: 'failed',
        listingStatus: 'error',
        message: publishStepError('RESOLVE_BARCODE', barcodeReady.message),
      }, 422);
    }
    claimed.listing.barcode = barcodeReady.barcode;
    inventory.barcode = barcodeReady.barcode;

    await writeAudit(supabase, listing.store_id, employee.id, employee.full_name || employeeName, listing, inventory, 'SHOPIFY_PUBLISH_STARTED', claimed.listing.shopify_product_id ? 'Retry started' : 'Publish started');

    const result = await publishToShopify(supabase, claimed.listing, inventory, employee.id, employee.full_name || employeeName, barcodeReady.barcode);
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
  if (!listingHasConfirmedTaxonomy(listing)) {
    issues.push({ field: 'shopifyCategoryId', message: shopifyCategoryRequiredMessage(listing) });
  }
  if (!String(listing.condition || '').trim()) issues.push({ field: 'condition', message: 'Condition is required.' });
  if (!inventory) {
    issues.push({ field: 'inventory', message: 'Inventory item does not exist.' });
    return issues;
  }
  const onHand = Number(inventory.quantity_on_hand || 0);
  if (!(onHand > 0) || inventory.status === 'sold') {
    issues.push({ field: 'quantity_on_hand', message: 'This item is no longer in stock and cannot be listed.' });
  }
  if (Number(listing.quantity) > onHand && onHand > 0) issues.push({ field: 'quantity', message: 'Listing quantity cannot exceed POS quantity on hand.' });
  if (inventory.status === 'listed' || inventory.listing_method === 'processed_manual') {
    issues.push({ field: 'inventory', message: 'Inventory item is already listed.' });
  }
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

async function resolveAndPersistBarcode(
  client: SupabaseClient,
  listing: Record<string, unknown>,
  inventory: Record<string, unknown> | null,
  employeeId: string,
  employeeName: string,
): Promise<{ ok: true; barcode: string } | { ok: false; message: string }> {
  if (!inventory) return { ok: false, message: 'Inventory item does not exist.' };
  const identity = {
    deviceCode: String(inventory.device_code || listing.sku || ''),
    sku: String(listing.sku || inventory.device_code || ''),
    serialImei: String(inventory.serial_imei || ''),
  };
  const specs = (inventory.specifications && typeof inventory.specifications === 'object')
    ? inventory.specifications as Record<string, unknown>
    : {};
  const existing = resolveExistingBarcode({
    inventoryBarcode: String(inventory.barcode || ''),
    listingBarcode: String(listing.barcode || ''),
    upcSku: String(specs.upcSku || ''),
    deviceCode: identity.deviceCode,
    sku: identity.sku,
    serialImei: identity.serialImei,
  });

  const posExisting = barcodeForShopify(String(inventory.barcode || ''), identity);
  const listingExisting = barcodeForShopify(String(listing.barcode || ''), identity);
  if (posExisting && listingExisting && posExisting !== listingExisting) {
    return { ok: false, message: BARCODE_MISMATCH_MESSAGE };
  }

  let barcode = existing;
  let generated = false;
  if (!barcode) {
    const taken = await loadTakenBarcodes(client, String(inventory.id));
    try {
      barcode = generateRetailBarcode({
        deviceCode: identity.deviceCode,
        inventoryId: String(inventory.id),
        taken,
      });
      generated = true;
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Could not generate a unique barcode.' };
    }
  }

  const savedInv = await client.from('pos_inventory').update({ barcode }).eq('id', String(inventory.id));
  if (savedInv.error && /barcode/i.test(savedInv.error.message || '')) {
    return { ok: false, message: 'Missing column pos_inventory.barcode. Run additive migration 20260904030000_pos_inventory_barcode.sql.' };
  }
  if (savedInv.error) {
    return { ok: false, message: 'Could not save barcode to POS inventory.' };
  }
  await client.from('pos_shopify_listings').update({ barcode, updated_at: new Date().toISOString() }).eq('id', String(listing.id));

  if (generated) {
    await writeAudit(client, String(listing.store_id), employeeId, employeeName, listing, inventory, 'BARCODE_GENERATED', `barcode=${barcode} device=${identity.deviceCode}`);
  }
  await writeAudit(client, String(listing.store_id), employeeId, employeeName, listing, inventory, 'BARCODE_ASSIGNED_TO_INVENTORY', `barcode=${barcode} inventory=${inventory.id}`);
  return { ok: true, barcode };
}

async function loadTakenBarcodes(client: SupabaseClient, exceptInventoryId: string): Promise<Set<string>> {
  const taken = new Set<string>();
  const remember = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    taken.add(raw);
    const digits = raw.replace(/\D/g, '');
    if (digits) taken.add(digits);
  };
  const { data: inventoryRows } = await client.from('pos_inventory').select('id, barcode').neq('id', exceptInventoryId);
  for (const row of inventoryRows || []) remember((row as { barcode?: string }).barcode);
  const { data: listingRows } = await client.from('pos_shopify_listings').select('inventory_item_id, barcode').neq('inventory_item_id', exceptInventoryId);
  for (const row of listingRows || []) remember((row as { barcode?: string }).barcode);
  return taken;
}

async function persistConfirmedBarcode(
  client: SupabaseClient,
  listing: Record<string, unknown>,
  inventory: Record<string, unknown>,
  barcode: string,
) {
  await client.from('pos_inventory').update({ barcode }).eq('id', String(inventory.id));
  await updateListingSafe(client, String(listing.id), { barcode, updated_at: new Date().toISOString() });
}

async function updateInventoryItemCost(inventoryItemId: string, cost: number) {
  const input = inventoryItemCostUpdateInput(cost);
  const result = await shopifyGraphql<{
    inventoryItemUpdate?: {
      inventoryItem?: { id?: string; tracked?: boolean; unitCost?: { amount?: string } };
      userErrors?: Array<{ message: string }>;
    };
  }>(`mutation InventoryCost($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem { id tracked unitCost { amount currencyCode } }
      userErrors { field message }
    }
  }`, { id: inventoryItemId, input });
  const err = userErrorsMessage(result.data?.inventoryItemUpdate?.userErrors);
  if (err) throw new Error(publishStepError('COST_UPDATE', err));
  if (!result.data?.inventoryItemUpdate?.inventoryItem?.id) {
    throw new Error(publishStepError('COST_UPDATE', 'Shopify did not confirm the inventory cost update.'));
  }
  const verified = await verifyInventoryItemCost(inventoryItemId, cost);
  if (!verified) {
    throw new Error(publishStepError('COST_UPDATE', 'Shopify unitCost did not match POS inventory cost.'));
  }
}

async function verifyInventoryItemCost(inventoryItemId: string, posCost: number): Promise<boolean> {
  const result = await shopifyGraphql<{
    inventoryItem?: { id?: string; unitCost?: { amount?: string } | null } | null;
  }>(`query InventoryCost($id: ID!) {
    inventoryItem(id: $id) { id unitCost { amount currencyCode } }
  }`, { id: inventoryItemId });
  return costsMatch(posCost, result.data?.inventoryItem?.unitCost?.amount);
}

async function readVariantBarcode(variantId: string, productId: string): Promise<string> {
  if (variantId) {
    const result = await shopifyGraphql<{ productVariant?: { barcode?: string | null } | null }>(
      `query VariantBarcode($id: ID!) { productVariant(id: $id) { barcode } }`,
      { id: variantId },
    );
    const value = String(result.data?.productVariant?.barcode || '').trim();
    if (value) return value;
  }
  const product = await fetchProduct(productId);
  return String(product?.barcode || '').trim();
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
  barcode: string,
) {
  const domain = shopifyStoreDomain();
  const warnings: string[] = [];
  const location = await resolveLocation();
  const qty = Math.min(Number(listing.quantity || 1), Number(inventory.quantity_on_hand || 1));
  const sku = String(listing.sku || inventory.device_code || '').trim();
  const posCost = Number(inventory.cost_per_unit || 0);
  let productId = String(listing.shopify_product_id || '');
  let variantId = String(listing.shopify_variant_id || '');
  let inventoryItemId = String(listing.shopify_inventory_item_id || '');
  let handle = String(listing.shopify_handle || '');
  let confirmedBarcode = barcode;
  let media = { expected: 0, uploaded: 0, warnings: [] as string[] };

  try {
    if (productId) {
      const existing = await fetchProduct(productId);
      if (!existing) {
        throw new Error(publishStepError('CREATE_OR_RECONCILE_PRODUCT', 'Saved Shopify product ID no longer exists. Manual reconciliation required.'));
      }
      productId = existing.id;
      handle = existing.handle || handle;
      const initial = chooseInitialVariant(existing.variants);
      variantId = String(initial?.id || existing.variantId || variantId);
      inventoryItemId = String(initial?.inventoryItem?.id || existing.inventoryItemId || inventoryItemId);
      await persistIds(client, listing, { productId, variantId, inventoryItemId, handle, locationId: location.id, barcode });
      await writeAudit(client, String(listing.store_id), employeeId, employeeName, listing, inventory, 'SHOPIFY_PUBLISH_RETRY', `Continuing existing product ${productId}`);
    } else {
      const matches = await lookupVariantsBySku(sku);
      const decision = skuLookupDecision(sku, matches);
      if (decision.action === 'duplicate') throw new Error(decision.message);
      if (decision.action === 'adopt') {
        productId = decision.productId;
        variantId = decision.variantId;
        inventoryItemId = decision.inventoryItemId;
        const adopted = await fetchProduct(productId);
        if (!adopted) {
          throw new Error(publishStepError('SKU_LOOKUP', 'Matched Shopify SKU product could not be loaded. Manual reconciliation required.'));
        }
        handle = adopted.handle || handle;
        const initial = chooseInitialVariant(adopted.variants);
        variantId = String(initial?.id || variantId);
        inventoryItemId = String(initial?.inventoryItem?.id || inventoryItemId);
        await persistIds(client, listing, { productId, variantId, inventoryItemId, handle, locationId: location.id, barcode });
        await writeAudit(client, String(listing.store_id), employeeId, employeeName, listing, inventory, 'SHOPIFY_PRODUCT_ADOPTED', productId);
      } else {
        const created = await createProduct(listing);
        productId = created.productId;
        variantId = created.variantId;
        inventoryItemId = created.inventoryItemId;
        handle = created.handle;
        await persistIds(client, listing, { productId, variantId, inventoryItemId, handle, locationId: location.id, barcode });
        await writeAudit(client, String(listing.store_id), employeeId, employeeName, listing, inventory, 'SHOPIFY_PRODUCT_CREATED', productId);
        const variantIssue = unexpectedVariantCountMessage(created.variantCount);
        if (variantIssue) throw new Error(variantIssue);
      }
    }

    await persistIds(client, listing, { productId, variantId, inventoryItemId, handle, locationId: location.id, barcode });

    await updateBaseProduct(listing, productId, approvedDescriptionHtml(String(listing.description || '')), productSetCategory(listing) || '');
    await updateInitialVariant(productId, variantId, sku, barcode, listing);

    if (!inventoryItemId) {
      throw new Error(publishStepError('COST_UPDATE', 'Shopify inventory item ID is missing.'));
    }
    await updateInventoryItemCost(inventoryItemId, posCost);
    await writeAudit(client, String(listing.store_id), employeeId, employeeName, listing, inventory, 'SHOPIFY_COST_SET', `inventoryItem=${inventoryItemId}`);
    await activateInventory(inventoryItemId, location.id, String(listing.id));
    await setInventory(inventoryItemId, location.id, qty, String(listing.id));
    const verifiedQty = await verifyInventory(inventoryItemId, location.id, qty);
    if (!verifiedQty) throw new Error(publishStepError('SET_INVENTORY', 'Shopify inventory quantity could not be verified.'));

    await assignCategory(productId, productSetCategory(listing) || '');

    media = await attachListingPhotos(client, productId, listing.photos, String(listing.title || 'Product'));
    warnings.push(...media.warnings);
    if (media.expected > 0 && media.uploaded === 0) {
      throw new Error(publishStepError('PHOTO_UPLOAD', `0 successful photos. Expected ${media.expected}.`));
    }

    await setMetafields(productId, listing);
    await activateProduct(productId);
    const publishedToStore = await publishToOnlineStore(productId, warnings);

    const shopifyBarcode = await readVariantBarcode(variantId, productId);
    const mismatch = detectBarcodeMismatch(barcode, shopifyBarcode);
    if (mismatch) throw new Error(publishStepError('BARCODE_VERIFY', mismatch));
    confirmedBarcode = shopifyBarcode || barcode;
    await persistConfirmedBarcode(client, listing, inventory, confirmedBarcode);
    await writeAudit(client, String(listing.store_id), employeeId, employeeName, listing, inventory, 'SHOPIFY_BARCODE_SET', `barcode=${confirmedBarcode}`);

    const verified = await fetchProduct(productId);
    if (!verified) throw new Error(publishStepError('VERIFY', 'Shopify product could not be loaded after update.'));
    const variantIssue = unexpectedVariantCountMessage(verified.variants.length);
    if (variantIssue) throw new Error(variantIssue);
    const initial = chooseInitialVariant(verified.variants);
    if (!initial?.id) throw new Error(publishStepError('VARIANT_VERIFY', 'Shopify product has no variant.'));
    variantId = initial.id;
    inventoryItemId = String(initial.inventoryItem?.id || inventoryItemId);
    if (String(initial.sku || '').trim().toUpperCase() !== sku.toUpperCase()) {
      throw new Error(publishStepError('VARIANT_VERIFY', `Shopify SKU ${initial.sku || '(blank)'} does not match POS device code ${sku}.`));
    }
    const sentHtml = approvedDescriptionHtml(String(listing.description || ''));
    const descIssue = descriptionVerificationIssue(sentHtml, verified.descriptionHtml);
    if (descIssue) throw new Error(descIssue);
    const expectedCategoryId = productSetCategory(listing) || '';
    if (expectedCategoryId && !categoryIdsMatch(expectedCategoryId, verified.category?.id)) {
      throw new Error(publishStepError('CATEGORY_UPDATE', `Shopify category ${verified.category?.id || '(blank)'} does not match ${expectedCategoryId}.`));
    }
    if (!(await verifyInventoryItemCost(inventoryItemId, posCost))) {
      throw new Error(publishStepError('COST_UPDATE', 'Shopify unitCost did not match POS inventory cost.'));
    }
    if (media.expected > 0 && verified.mediaCount < 1) {
      throw new Error(publishStepError('PHOTO_UPLOAD', 'Shopify product has no media after photo upload.'));
    }

    const adminUrl = adminProductUrl(domain, productId);
    const storefrontUrl = publishedToStore && handle ? storefrontProductUrl(domain, handle) : '';
    const now = new Date().toISOString();
    await persistIdsOrThrow(client, listing, {
      status: 'active',
      barcode: confirmedBarcode,
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
    await writeAudit(client, String(listing.store_id), employeeId, employeeName, listing, inventory, 'SHOPIFY_LISTING_ACTIVE', `barcode=${confirmedBarcode} product=${productId}`);
    await markInventoryShopifyListed(client, String(inventory.id));

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
      barcode: confirmedBarcode,
      labelEligible: true,
      photo_count_expected: media.expected,
      photo_count_uploaded: media.uploaded,
      photo_warnings: media.warnings,
      warnings,
    };
  } catch (err) {
    const message = sanitizeShopifyError(err instanceof Error ? err.message : 'Shopify publish failed.');
    await updateListingSafe(client, String(listing.id), {
      status: 'error',
      last_error: message,
      barcode: barcode || listing.barcode || null,
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
      barcode: barcode || undefined,
      photo_count_expected: media.expected,
      photo_count_uploaded: media.uploaded,
      photo_warnings: media.warnings,
      warnings,
    };
  }
}

type VariantNode = {
  id: string;
  title?: string | null;
  sku?: string | null;
  barcode?: string | null;
  inventoryItem?: {
    id?: string;
    unitCost?: { amount?: string; currencyCode?: string } | null;
  } | null;
};

type ProductSnapshot = {
  id: string;
  handle: string;
  descriptionHtml?: string | null;
  category?: { id?: string | null; name?: string | null } | null;
  variants: VariantNode[];
  mediaCount: number;
  barcode?: string;
  variantId?: string;
  inventoryItemId?: string;
};

function throwStep(step: string, message: string): never {
  throw new Error(publishStepError(step, message));
}

async function createProduct(listing: Record<string, unknown>) {
  const input = buildProductCreatePayload(listing);
  const result = await shopifyGraphql<{
    productSet: {
      product?: {
        id: string;
        handle: string;
        variants?: { nodes: VariantNode[] };
      };
      userErrors?: Array<{ field?: string[]; message: string }>;
    };
  }>(`mutation ProductSet($input: ProductSetInput!, $synchronous: Boolean) {
    productSet(input: $input, synchronous: $synchronous) {
      product {
        id
        handle
        descriptionHtml
        category { id name }
        variants(first: 10) {
          nodes { id title sku barcode inventoryItem { id unitCost { amount currencyCode } } }
        }
      }
      userErrors { field message }
    }
  }`, { synchronous: true, input });
  const err = userErrorsMessage(result.data?.productSet?.userErrors);
  const product = result.data?.productSet?.product;
  if (!product?.id) {
    if (err) throw new Error(publishStepError('CREATE_OR_RECONCILE_PRODUCT', err));
    throwStep('CREATE_OR_RECONCILE_PRODUCT', 'Shopify did not return a product ID.');
  }
  const nodes = product.variants?.nodes || [];
  const initial = chooseInitialVariant(nodes);
  if (!initial?.id) {
    throwStep('CREATE_OR_RECONCILE_PRODUCT', 'Shopify did not return the initial product variant.');
  }
  return {
    productId: product.id,
    variantId: String(initial.id),
    inventoryItemId: String(initial.inventoryItem?.id || ''),
    handle: product.handle || '',
    variantCount: nodes.length,
  };
}

async function lookupVariantsBySku(sku: string): Promise<Array<{ productId: string; variantId: string; inventoryItemId?: string; sku?: string | null }>> {
  const safe = sku.replace(/"/g, '');
  if (!safe) return [];
  const result = await shopifyGraphql<{
    productVariants?: {
      nodes: Array<{
        id: string;
        sku?: string | null;
        product?: { id: string };
        inventoryItem?: { id?: string };
      }>;
    };
  }>(`query SkuSearch($query: String!) {
    productVariants(first: 25, query: $query) {
      nodes {
        id
        sku
        product { id }
        inventoryItem { id }
      }
    }
  }`, { query: `sku:"${safe}"` });
  return (result.data?.productVariants?.nodes || [])
    .filter((row) => row.product?.id && row.id)
    .map((row) => ({
      productId: row.product!.id,
      variantId: row.id,
      inventoryItemId: row.inventoryItem?.id || '',
      sku: row.sku,
    }));
}

async function fetchProduct(id: string): Promise<ProductSnapshot | null> {
  const result = await shopifyGraphql<{
    product: {
      id: string;
      handle: string;
      descriptionHtml?: string | null;
      category?: { id?: string | null; name?: string | null } | null;
      variants?: { nodes: VariantNode[] };
      media?: { nodes: Array<{ id: string }> };
    } | null;
  }>(`query Product($id: ID!) {
    product(id: $id) {
      id
      handle
      descriptionHtml
      category { id name }
      variants(first: 10) {
        nodes { id title sku barcode inventoryItem { id unitCost { amount currencyCode } } }
      }
      media(first: 30) { nodes { id } }
    }
  }`, { id });
  const product = result.data?.product;
  if (!product) return null;
  const variants = product.variants?.nodes || [];
  return {
    id: product.id,
    handle: product.handle,
    descriptionHtml: product.descriptionHtml,
    category: product.category,
    variants,
    mediaCount: product.media?.nodes?.length || 0,
    barcode: variants[0]?.barcode || '',
    variantId: variants[0]?.id || '',
    inventoryItemId: variants[0]?.inventoryItem?.id || '',
  };
}

async function updateBaseProduct(
  listing: Record<string, unknown>,
  productId: string,
  descriptionHtml: string,
  categoryId: string,
) {
  const input = buildProductUpdatePayload(listing, { descriptionHtml, categoryId });
  const product = { id: productId, ...input };

  const runUpdate = async (payload: Record<string, unknown>) => {
    const result = await shopifyGraphql<{
      productUpdate: {
        product?: { id: string; descriptionHtml?: string | null; category?: { id?: string | null } | null };
        userErrors?: Array<{ message: string }>;
      };
    }>(`mutation UpdateProduct($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product { id descriptionHtml category { id name } }
        userErrors { field message }
      }
    }`, { product: payload });
    const err = userErrorsMessage(result.data?.productUpdate?.userErrors);
    if (err) throw new Error(err);
    return result.data?.productUpdate?.product;
  };

  const runSet = async (setInput: Record<string, unknown>) => {
    const result = await shopifyGraphql<{
      productSet?: {
        product?: { id: string; descriptionHtml?: string | null; category?: { id?: string | null } | null };
        userErrors?: Array<{ message: string }>;
      };
    }>(`mutation UpdateProductSet($identifier: ProductSetIdentifiers, $input: ProductSetInput!, $synchronous: Boolean) {
      productSet(identifier: $identifier, input: $input, synchronous: $synchronous) {
        product { id descriptionHtml category { id name } }
        userErrors { field message }
      }
    }`, {
      identifier: { id: productId },
      synchronous: true,
      input: setInput,
    });
    const err = userErrorsMessage(result.data?.productSet?.userErrors);
    if (err) throw new Error(err);
    return result.data?.productSet?.product;
  };

  try {
    const updated = await runUpdate(product);
    const descIssue = descriptionVerificationIssue(descriptionHtml, updated?.descriptionHtml);
    if (descIssue) throw new Error(descIssue);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (categoryId && /categor/i.test(message)) {
      const { category: _ignored, ...withoutCategory } = input;
      const updated = await runUpdate({ id: productId, ...withoutCategory });
      const descIssue = descriptionVerificationIssue(descriptionHtml, updated?.descriptionHtml);
      if (descIssue) {
        const fallback = await runSet(buildDescriptionSetPayload(descriptionHtml));
        const fallbackIssue = descriptionVerificationIssue(descriptionHtml, fallback?.descriptionHtml);
        if (fallbackIssue) throw new Error(publishStepError('UPDATE_BASE_PRODUCT', fallbackIssue));
      }
      return;
    }
    try {
      const fallback = await runSet(input);
      const descIssue = descriptionVerificationIssue(descriptionHtml, fallback?.descriptionHtml);
      if (descIssue) throw new Error(descIssue);
      return;
    } catch (fallbackErr) {
      const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : message;
      throw new Error(publishStepError('UPDATE_BASE_PRODUCT', fallbackMessage));
    }
  }
}

async function updateInitialVariant(
  productId: string,
  variantId: string,
  sku: string,
  barcode: string,
  listing: Record<string, unknown>,
) {
  if (!variantId) throwStep('VARIANT_UPDATE', 'Shopify product has no initial variant to update.');
  const result = await shopifyGraphql<{
    productVariantsBulkUpdate?: {
      productVariants?: Array<{ id?: string; sku?: string; barcode?: string }>;
      userErrors?: Array<{ message: string }>;
    };
  }>(`mutation VariantUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku barcode }
      userErrors { field message }
    }
  }`, {
    productId,
    variants: [buildVariantUpdatePayload({
      variantId,
      sku,
      barcode,
      price: listing.price as number | string,
      compareAtPrice: (listing.compare_at_price ?? listing.compareAtPrice) as number | string | null,
    })],
  });
  const err = userErrorsMessage(result.data?.productVariantsBulkUpdate?.userErrors);
  if (err) throw new Error(publishStepError('VARIANT_UPDATE', err));
}

async function assignCategory(productId: string, categoryId: string) {
  if (!categoryId) return;
  const updated = await shopifyGraphql<{
    productUpdate?: {
      product?: { category?: { id?: string | null } | null };
      userErrors?: Array<{ message: string }>;
    };
  }>(`mutation SetCategory($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id category { id name } }
      userErrors { field message }
    }
  }`, { product: { id: productId, category: categoryId } });
  const err = userErrorsMessage(updated.data?.productUpdate?.userErrors);
  if (err) {
    const fallback = await shopifyGraphql<{
      productSet?: {
        product?: { category?: { id?: string | null } | null };
        userErrors?: Array<{ message: string }>;
      };
    }>(`mutation SetCategorySet($identifier: ProductSetIdentifiers, $input: ProductSetInput!, $synchronous: Boolean) {
      productSet(identifier: $identifier, input: $input, synchronous: $synchronous) {
        product { id category { id name } }
        userErrors { field message }
      }
    }`, {
      identifier: { id: productId },
      synchronous: true,
      input: buildCategorySetPayload(categoryId),
    });
    const fallbackErr = userErrorsMessage(fallback.data?.productSet?.userErrors);
    if (fallbackErr) throw new Error(publishStepError('CATEGORY_UPDATE', fallbackErr));
    if (!categoryIdsMatch(categoryId, fallback.data?.productSet?.product?.category?.id)) {
      throwStep('CATEGORY_UPDATE', `Shopify category ${fallback.data?.productSet?.product?.category?.id || '(blank)'} does not match ${categoryId}.`);
    }
    return;
  }
  if (!categoryIdsMatch(categoryId, updated.data?.productUpdate?.product?.category?.id)) {
    throwStep('CATEGORY_UPDATE', `Shopify category ${updated.data?.productUpdate?.product?.category?.id || '(blank)'} does not match ${categoryId}.`);
  }
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
      throw new Error(publishStepError('SET_INVENTORY', err));
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
  if (err) throw new Error(publishStepError('SET_INVENTORY', err));
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

async function attachListingPhotos(
  client: SupabaseClient,
  productId: string,
  photos: unknown,
  alt: string,
): Promise<{ expected: number; uploaded: number; warnings: string[] }> {
  const assets = listingPhotoAssets(photos);
  const expected = assets.length;
  if (!expected) return { expected: 0, uploaded: 0, warnings: [] };

  const existing = await shopifyGraphql<{ product: { media?: { nodes: Array<{ id: string }> } } }>(
    `query Media($id: ID!) { product(id: $id) { media(first: 30) { nodes { id } } } }`,
    { id: productId },
  );
  const existingCount = existing.data?.product?.media?.nodes.length || 0;
  if (existingCount >= expected) return { expected, uploaded: existingCount, warnings: [] };

  let succeeded = existingCount;
  const warnings: string[] = [];
  for (const asset of assets) {
    const kind = asset.kind || photoSourceKind(asset.url, asset.path);
    try {
      const source = await resolveListingMediaSource(client, asset, asset.index);
      const result = await shopifyGraphql<{
        productCreateMedia: { mediaUserErrors?: Array<{ message: string }>; media?: Array<{ id?: string }> };
      }>(`mutation AddMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { ... on MediaImage { id status } }
          mediaUserErrors { field message }
        }
      }`, {
        productId,
        media: [{ originalSource: source, mediaContentType: 'IMAGE', alt: `${alt} ${asset.index + 1}` }],
      });
      const err = userErrorsMessage(result.data?.productCreateMedia?.mediaUserErrors);
      if (err) throw new Error(err);
      if (!result.data?.productCreateMedia?.media?.some((row) => row.id)) {
        throw new Error('Shopify did not return media IDs.');
      }
      succeeded += 1;
    } catch (err) {
      const message = sanitizeShopifyError(err instanceof Error ? err.message : 'failed');
      const labeled = publishStepError(`PHOTO_UPLOAD[${asset.index}]`, `${kind}: ${message}`);
      warnings.push(labeled);
      console.error('[shopify-publish]', labeled);
    }
  }

  if (expected > 0 && succeeded === 0) {
    throw new Error(publishStepError('PHOTO_UPLOAD', warnings.join('; ') || '0 successful photos.'));
  }
  return { expected, uploaded: succeeded, warnings };
}

async function resolveListingMediaSource(
  client: SupabaseClient,
  asset: { url: string; path?: string; index: number },
  index: number,
): Promise<string> {
  if (asset.path) {
    const signed = await client.storage.from('shopify-listing-photos').createSignedUrl(asset.path, 60 * 60);
    if (signed.data?.signedUrl) return signed.data.signedUrl;
  }
  if (asset.url.startsWith('data:')) return stagedUploadDataUrl(asset.url, index);
  if (isHttpUrl(asset.url)) return asset.url;
  throw new Error('Unsupported image source.');
}

async function stagedUploadDataUrl(photo: string, index: number): Promise<string> {
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
  if (fields.length) {
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
    if (err) throw new Error(publishStepError('SET_METAFIELDS', err));
  }
  const categoryFields = categoryMetafields(listing);
  if (!categoryFields.length) return;
  try {
    await shopifyGraphql(`mutation Meta($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { field message } }
    }`, {
      metafields: categoryFields.map((field) => ({
        ownerId: productId,
        namespace: field.namespace,
        key: field.key,
        type: field.type,
        value: field.value,
      })),
    });
  } catch {
    // Shopify category metafields are best-effort and must not block publishing.
  }
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
      `mutation ActivateSet($identifier: ProductSetIdentifiers, $input: ProductSetInput!, $synchronous: Boolean) {
        productSet(identifier: $identifier, input: $input, synchronous: $synchronous) { userErrors { field message } }
      }`,
      { identifier: { id: productId }, input: { status: 'ACTIVE' }, synchronous: true },
    );
    const fallbackErr = userErrorsMessage(fallback.data?.productSet?.userErrors);
    if (fallbackErr) throw new Error(publishStepError('ACTIVATE', fallbackErr));
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

async function markInventoryShopifyListed(client: SupabaseClient, inventoryId: string) {
  const now = new Date().toISOString();
  const full = await client.from('pos_inventory').update({
    status: 'listed',
    listing_method: 'shopify',
  }).eq('id', inventoryId);
  if (!full.error) return;
  await client.from('pos_inventory').update({ status: 'listed' }).eq('id', inventoryId);
}

async function persistIds(
  client: SupabaseClient,
  listing: Record<string, unknown>,
  ids: { productId: string; variantId: string; inventoryItemId: string; handle: string; locationId: string; barcode?: string },
) {
  const result = await updateListingSafe(client, String(listing.id), {
    shopify_product_id: ids.productId,
    shopify_variant_id: ids.variantId || null,
    shopify_inventory_item_id: ids.inventoryItemId || null,
    shopify_handle: ids.handle || null,
    shopify_location_id: ids.locationId,
    shopify_url: adminProductUrl(shopifyStoreDomain(), ids.productId),
    shopify_admin_url: adminProductUrl(shopifyStoreDomain(), ids.productId),
    ...(ids.barcode ? { barcode: ids.barcode } : {}),
    updated_at: new Date().toISOString(),
  });
  if (result.error) throw new Error(publishStepError('SAVE_SHOPIFY_IDS', result.error.message));
  listing.shopify_product_id = ids.productId;
  listing.shopify_variant_id = ids.variantId;
  listing.shopify_inventory_item_id = ids.inventoryItemId;
  listing.shopify_handle = ids.handle;
}

async function failListing(client: SupabaseClient, listing: Record<string, unknown>, message: string) {
  await updateListingSafe(client, String(listing.id), {
    status: 'error',
    last_error: message,
    updated_at: new Date().toISOString(),
  });
}

async function persistIdsOrThrow(client: SupabaseClient, listing: Record<string, unknown>, patch: Record<string, unknown>) {
  const result = await updateListingSafe(client, String(listing.id), patch);
  if (result.error) throw new Error(publishStepError('SAVE_SHOPIFY_IDS', result.error.message));
}

async function updateListingSafe(client: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<{ error?: { message: string } | null }> {
  const first = await client.from('pos_shopify_listings').update(patch).eq('id', id);
  if (!first.error) return { error: null };
  const fallback = { ...patch };
  delete fallback.shopify_admin_url;
  delete fallback.shopify_storefront_url;
  delete fallback.publish_attempts;
  delete fallback.last_publish_attempt_at;
  delete fallback.publish_warning;
  delete fallback.shopify_location_id;
  const second = await client.from('pos_shopify_listings').update(fallback).eq('id', id);
  if (second.error) {
    console.error('[shopify-publish] update failed', second.error.message);
    return { error: { message: second.error.message } };
  }
  return { error: null };
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
    details: `${details} | listing=${listing.id} inventory=${listing.inventory_item_id} device=${inventory?.device_code || listing.sku || ''} barcode=${listing.barcode || inventory?.barcode || ''}`.slice(0, 500),
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
