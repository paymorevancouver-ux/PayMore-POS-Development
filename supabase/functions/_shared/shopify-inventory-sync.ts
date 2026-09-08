import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  sanitizeShopifyError,
  shopifyConfiguredLocationId,
  shopifyConfiguredPublicationId,
  shopifyGraphql,
  shopifyStoreDomain,
  userErrorsMessage,
} from './shopify.ts';
import {
  listingStatusForPosQuantity,
  shopifyProductStatusForPosQuantity,
  SHOPIFY_LISTING_RECONCILIATION_REQUIRED,
} from './shopify-sale-sync.ts';

export type InventorySyncInput = {
  inventoryItemId: string;
  reason: string;
  storeId?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  posSaleId?: string | null;
  posReturnId?: string | null;
  shopifyOrderId?: string | null;
  shopifyRefundId?: string | null;
  direction?: string | null;
};

export type InventorySyncResult = {
  success: boolean;
  status: 'synced' | 'pending' | 'error' | 'skipped';
  message: string;
  eventType?: string;
  inventoryItemId: string;
  listingId?: string | null;
  quantityOnHand?: number;
  shopifyQuantity?: number;
  shopifyProductId?: string | null;
  shopifyProductStatus?: 'ACTIVE' | 'ARCHIVED' | null;
  published?: boolean;
  code?: string;
  error?: string;
};

type ListingRow = {
  id: string;
  store_id: string;
  inventory_item_id: string;
  status: string;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_inventory_item_id: string | null;
  shopify_location_id: string | null;
  sku: string | null;
  barcode: string | null;
};

type InventoryRow = {
  id: string;
  store_id: string;
  quantity_on_hand: number;
  status: string;
  listing_method: string | null;
  cost_per_unit?: number | null;
};

function jsonEventStatus(success: boolean, skipped = false): 'success' | 'error' | 'skipped' | 'pending' {
  if (skipped) return 'skipped';
  return success ? 'success' : 'error';
}

async function recordSyncEvent(
  client: SupabaseClient,
  input: InventorySyncInput,
  listing: ListingRow | null,
  inventory: InventoryRow | null,
  result: InventorySyncResult,
) {
  await client.from('pos_shopify_sync_events').insert({
    store_id: input.storeId || inventory?.store_id || listing?.store_id || null,
    direction: input.direction || 'pos_to_shopify',
    event_type: result.eventType || input.reason || 'SHOPIFY_INVENTORY_SYNC',
    inventory_item_id: input.inventoryItemId,
    listing_id: listing?.id || null,
    pos_sale_id: input.posSaleId || null,
    pos_return_id: input.posReturnId || null,
    shopify_order_id: input.shopifyOrderId || null,
    shopify_refund_id: input.shopifyRefundId || null,
    quantity_before: inventory?.quantity_on_hand ?? null,
    quantity_after: result.quantityOnHand ?? inventory?.quantity_on_hand ?? null,
    shopify_quantity: result.shopifyQuantity ?? null,
    status: jsonEventStatus(result.success, result.status === 'skipped'),
    error: result.error || (result.success ? null : result.message),
    completed_at: new Date().toISOString(),
  });
}

export async function loadListingForInventory(
  client: SupabaseClient,
  inventoryItemId: string,
): Promise<ListingRow | null> {
  const { data } = await client
    .from('pos_shopify_listings')
    .select('id, store_id, inventory_item_id, status, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, shopify_location_id, sku, barcode')
    .eq('inventory_item_id', inventoryItemId)
    .order('updated_at', { ascending: false });
  const rows = (data || []) as ListingRow[];
  return rows.find((row) => row.shopify_product_id && (row.status === 'active' || row.status === 'sold' || row.status === 'ended'))
    || rows.find((row) => row.shopify_product_id)
    || rows[0]
    || null;
}

async function setShopifyQuantity(inventoryItemId: string, locationId: string, quantity: number, listingId: string) {
  const result = await shopifyGraphql<{
    inventorySetQuantities: { userErrors?: Array<{ message: string }> };
  }>(`mutation SetQty($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      userErrors { field message }
    }
  }`, {
    idempotencyKey: `pos-sync-qty-${listingId}-${inventoryItemId}-${quantity}`,
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
  if (err) throw new Error(err);
}

async function activateInventoryItem(inventoryItemId: string, locationId: string, listingId: string) {
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
      idempotencyKey: `pos-sync-activate-${listingId}-${inventoryItemId}-${locationId}`,
    });
    const err = userErrorsMessage(result.data?.inventoryActivate?.userErrors);
    if (err && !/already.+activ/i.test(err)) throw new Error(err);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/already.+activ/i.test(message)) return;
    throw err;
  }
}

async function denyOverselling(productId: string, variantId: string) {
  const result = await shopifyGraphql<{
    productVariantsBulkUpdate: { userErrors?: Array<{ message: string }> };
  }>(`mutation DenyOversell($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors { field message }
    }
  }`, {
    productId,
    variants: [{
      id: variantId,
      inventoryPolicy: 'DENY',
      inventoryItem: { tracked: true },
    }],
  });
  const err = userErrorsMessage(result.data?.productVariantsBulkUpdate?.userErrors);
  if (err) throw new Error(err);
}

async function setProductStatus(productId: string, status: 'ACTIVE' | 'ARCHIVED') {
  const result = await shopifyGraphql<{
    productUpdate: { product?: { id?: string; status?: string }; userErrors?: Array<{ message: string }> };
  }>(`mutation SetStatus($product: ProductUpdateInput!) {
    productUpdate(product: $product) { product { id status } userErrors { field message } }
  }`, { product: { id: productId, status } });
  const err = userErrorsMessage(result.data?.productUpdate?.userErrors);
  if (err) throw new Error(err);
  return (result.data?.productUpdate?.product?.id || productId) as string;
}

async function publishToOnlineStore(productId: string): Promise<{ published: boolean; warning?: string }> {
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
      return { published: false, warning: 'Online Store publication was not found. Set SHOPIFY_PUBLICATION_ID.' };
    }
    const result = await shopifyGraphql<{ publishablePublish: { userErrors?: Array<{ message: string }> } }>(
      `mutation Pub($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { field message } }
      }`,
      { id: productId, input: [{ publicationId }] },
    );
    const err = userErrorsMessage(result.data?.publishablePublish?.userErrors);
    if (err) return { published: false, warning: err };
    return { published: true };
  } catch (err) {
    return { published: false, warning: sanitizeShopifyError(err instanceof Error ? err.message : 'Publication failed') };
  }
}

export async function syncShopifyInventoryForItem(
  client: SupabaseClient,
  input: InventorySyncInput,
): Promise<InventorySyncResult> {
  const { data: inventory, error: inventoryError } = await client
    .from('pos_inventory')
    .select('id, store_id, quantity_on_hand, status, listing_method, cost_per_unit')
    .eq('id', input.inventoryItemId)
    .maybeSingle();
  if (inventoryError || !inventory) {
    const result: InventorySyncResult = {
      success: false,
      status: 'error',
      inventoryItemId: input.inventoryItemId,
      message: 'POS inventory item was not found.',
      eventType: 'SHOPIFY_SYNC_ERROR',
      error: inventoryError?.message,
    };
    await recordSyncEvent(client, input, null, null, result);
    return result;
  }

  const row = inventory as InventoryRow;
  const listing = await loadListingForInventory(client, row.id);
  if (!listing) {
    const result: InventorySyncResult = {
      success: true,
      status: 'skipped',
      inventoryItemId: row.id,
      quantityOnHand: row.quantity_on_hand,
      message: 'No Shopify listing exists for this inventory item.',
      eventType: input.reason || 'SHOPIFY_INVENTORY_SYNC',
    };
    await recordSyncEvent(client, input, null, row, result);
    return result;
  }

  if (row.listing_method && row.listing_method !== 'shopify' && !listing.shopify_product_id) {
    const result: InventorySyncResult = {
      success: true,
      status: 'skipped',
      inventoryItemId: row.id,
      listingId: listing.id,
      quantityOnHand: row.quantity_on_hand,
      message: 'Inventory is not Shopify-listed; Shopify was not changed.',
      eventType: input.reason || 'SHOPIFY_INVENTORY_SYNC',
    };
    await recordSyncEvent(client, input, listing, row, result);
    return result;
  }

  if (!listing.shopify_product_id) {
    const result: InventorySyncResult = {
      success: false,
      status: 'error',
      inventoryItemId: row.id,
      listingId: listing.id,
      quantityOnHand: row.quantity_on_hand,
      code: SHOPIFY_LISTING_RECONCILIATION_REQUIRED,
      message: SHOPIFY_LISTING_RECONCILIATION_REQUIRED,
      eventType: 'SHOPIFY_SYNC_ERROR',
      error: 'Shopify product ID is missing. Do not create a new product.',
    };
    await client.from('pos_shopify_listings').update({
      sync_status: 'error',
      last_sync_error: result.message,
      last_sync_event_type: result.eventType,
    }).eq('id', listing.id);
    await recordSyncEvent(client, input, listing, row, result);
    return result;
  }

  const qty = Math.max(0, Number(row.quantity_on_hand) || 0);
  const locationId = listing.shopify_location_id || shopifyConfiguredLocationId();
  const productStatus = shopifyProductStatusForPosQuantity(qty);
  const listingStatus = listingStatusForPosQuantity(qty);
  const warnings: string[] = [];
  let published = false;
  let eventType = input.reason || 'SHOPIFY_INVENTORY_SYNC';

  try {
    if (!listing.shopify_inventory_item_id || !locationId) {
      throw new Error('Shopify inventory item or location is missing.');
    }
    if (listing.shopify_variant_id) {
      await denyOverselling(listing.shopify_product_id, listing.shopify_variant_id);
    }
    if (qty > 0) {
      await activateInventoryItem(listing.shopify_inventory_item_id, locationId, listing.id);
    }
    await setShopifyQuantity(listing.shopify_inventory_item_id, locationId, qty, listing.id);
    const preservedProductId = await setProductStatus(listing.shopify_product_id, productStatus);
    if (preservedProductId && listing.shopify_product_id && preservedProductId !== listing.shopify_product_id
      && !preservedProductId.endsWith(listing.shopify_product_id.split('/').pop() || '')) {
      throw new Error('Shopify product ID changed during sync. Aborting to preserve the original product.');
    }
    if (qty > 0) {
      const pub = await publishToOnlineStore(listing.shopify_product_id);
      published = pub.published;
      if (pub.warning) warnings.push(pub.warning);
      eventType = listing.status === 'sold' || listing.status === 'ended'
        ? 'SHOPIFY_PRODUCT_REACTIVATED'
        : (input.reason || 'SHOPIFY_INVENTORY_SYNC');
    } else {
      eventType = 'SHOPIFY_PRODUCT_ARCHIVED';
    }

    await client.from('pos_shopify_listings').update({
      status: listingStatus,
      quantity: qty,
      sync_status: warnings.length ? 'error' : 'synced',
      last_sync_error: warnings[0] || null,
      last_sync_event_type: eventType,
      last_synced_at: new Date().toISOString(),
      last_error: warnings[0] || null,
      ended_at: qty === 0 ? new Date().toISOString() : null,
    }).eq('id', listing.id);

    const result: InventorySyncResult = {
      success: warnings.length === 0,
      status: warnings.length ? 'pending' : 'synced',
      inventoryItemId: row.id,
      listingId: listing.id,
      quantityOnHand: qty,
      shopifyQuantity: qty,
      shopifyProductId: listing.shopify_product_id,
      shopifyProductStatus: productStatus,
      published,
      eventType,
      message: warnings[0] || (qty === 0
        ? 'Shopify quantity set to 0 and product archived.'
        : 'Shopify quantity synced to POS quantity.'),
      error: warnings[0],
    };
    await recordSyncEvent(client, input, listing, row, result);
    return result;
  } catch (err) {
    const message = sanitizeShopifyError(err instanceof Error ? err.message : 'Shopify inventory sync failed.');
    await client.from('pos_shopify_listings').update({
      sync_status: 'error',
      last_sync_error: message,
      last_sync_event_type: 'SHOPIFY_SYNC_ERROR',
    }).eq('id', listing.id);
    const result: InventorySyncResult = {
      success: false,
      status: 'error',
      inventoryItemId: row.id,
      listingId: listing.id,
      quantityOnHand: qty,
      shopifyProductId: listing.shopify_product_id,
      eventType: 'SHOPIFY_SYNC_ERROR',
      message,
      error: message,
    };
    await recordSyncEvent(client, input, listing, row, result);
    return result;
  }
}
