import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { shopifyClientSecret, shopifyStoreDomain } from '../_shared/shopify.ts';
import { sha256Hex, verifyShopifyWebhookHmac } from '../_shared/shopify-hmac.ts';
import { syncShopifyInventoryForItem } from '../_shared/shopify-inventory-sync.ts';
import {
  canDeductForShopifyOrder,
  cancellationRestockQuantity,
  generateCode,
  generateId,
  matchShopifyLineItem,
  normalizeShopifyGid,
  normalizeWebhookTopic,
  refundRestockQuantity,
  restoreInventoryTarget,
  shouldCreatePosSale,
  shouldSkipProcessedWebhook,
  shopifyOrderAdminUrl,
  SHOPIFY_OVERSOLD,
} from '../_shared/shopify-sale-sync.ts';

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

function header(req: Request, name: string): string {
  return req.headers.get(name) || req.headers.get(name.toLowerCase()) || '';
}

function webhookSecret(): string {
  return (Deno.env.get('SHOPIFY_WEBHOOK_SECRET') || shopifyClientSecret() || '').trim();
}

async function audit(
  client: SupabaseClient,
  storeId: string,
  action: string,
  recordType: string,
  recordId: string,
  details: string,
) {
  const employeeId = await resolveEmployeeId(client, storeId);
  await client.from('pos_audit_log').insert({
    id: generateId('AUD'),
    store_id: storeId,
    actor_employee_id: employeeId,
    actor_name: 'Shopify',
    module: 'Shopify Sync',
    action,
    record_type: recordType,
    record_id: recordId,
    details,
    created_at: new Date().toISOString(),
  });
}

async function resolveEmployeeId(client: SupabaseClient, storeId: string): Promise<string> {
  const { data: admin } = await client
    .from('pos_employees')
    .select('id')
    .eq('is_active', true)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  if (admin?.id) return admin.id as string;
  const { data: anyEmp } = await client
    .from('pos_employees')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return (anyEmp?.id as string) || 'shopify';
}

async function resolveStoreId(client: SupabaseClient): Promise<string> {
  const { data } = await client.from('pos_stores').select('id').limit(1).maybeSingle();
  return (data?.id as string) || '';
}

function customerName(order: Record<string, unknown>): string {
  const customer = (order.customer || {}) as Record<string, unknown>;
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  return String(order.billing_address && (order.billing_address as { name?: string }).name || '').trim();
}

function splitTax(totalTax: number, taxLines: Array<{ title?: string; price?: string | number }>): { gst: number; pst: number } {
  let gst = 0;
  let pst = 0;
  for (const line of taxLines) {
    const title = String(line.title || '').toLowerCase();
    const amount = Number(line.price) || 0;
    if (title.includes('pst') || title.includes('provincial')) pst += amount;
    else gst += amount;
  }
  if (!taxLines.length) return { gst: totalTax, pst: 0 };
  return { gst, pst };
}

async function loadMatchSources(client: SupabaseClient) {
  const { data: listings } = await client
    .from('pos_shopify_listings')
    .select('id, inventory_item_id, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, sku, status');
  const { data: inventory } = await client
    .from('pos_inventory')
    .select('id, device_code, barcode');
  return {
    listings: (listings || []).map((row) => ({
      id: row.id as string,
      inventoryItemId: row.inventory_item_id as string,
      shopifyProductId: (row.shopify_product_id as string) || null,
      shopifyVariantId: (row.shopify_variant_id as string) || null,
      shopifyInventoryItemId: (row.shopify_inventory_item_id as string) || null,
      sku: (row.sku as string) || null,
      status: (row.status as string) || null,
    })),
    inventory: (inventory || []).map((row) => ({
      id: row.id as string,
      deviceCode: (row.device_code as string) || null,
      barcode: (row.barcode as string) || null,
    })),
  };
}

async function upsertOrder(client: SupabaseClient, storeId: string, order: Record<string, unknown>, status: string) {
  const shopifyOrderId = String(order.id || '');
  const id = `SOR-${shopifyOrderId}`;
  const row = {
    id,
    store_id: storeId,
    shopify_order_id: shopifyOrderId,
    shopify_order_name: String(order.name || ''),
    financial_status: String(order.financial_status || ''),
    fulfillment_status: order.fulfillment_status ? String(order.fulfillment_status) : null,
    currency: String(order.currency || 'CAD'),
    subtotal: Number(order.subtotal_price) || 0,
    tax: Number(order.total_tax) || 0,
    total: Number(order.total_price) || 0,
    customer_name: customerName(order) || null,
    customer_email: String(order.email || (order.customer as { email?: string } | undefined)?.email || '') || null,
    status,
    shopify_order_url: shopifyOrderAdminUrl(shopifyStoreDomain(), shopifyOrderId),
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await client
    .from('pos_shopify_orders')
    .select('*')
    .eq('shopify_order_id', shopifyOrderId)
    .maybeSingle();
  if (existing) {
    await client.from('pos_shopify_orders').update(row).eq('id', existing.id);
    return existing as Record<string, unknown>;
  }
  const { data, error } = await client.from('pos_shopify_orders').insert(row).select().single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

async function sellAtomic(client: SupabaseClient, inventoryId: string, quantity: number, soldAt: string) {
  const { data, error } = await client.rpc('pos_sell_inventory_atomic', {
    p_inventory_id: inventoryId,
    p_quantity: quantity,
    p_sold_at: soldAt,
  });
  if (error) {
    const message = error.message || '';
    if (message.includes('INSUFFICIENT_STOCK')) {
      return { ok: false as const, code: SHOPIFY_OVERSOLD, message };
    }
    return { ok: false as const, code: 'ERROR', message };
  }
  return { ok: true as const, data };
}

async function restoreAtomic(
  client: SupabaseClient,
  inventoryId: string,
  quantity: number,
  targetStatus: string,
  sellable = true,
) {
  const { data, error } = await client.rpc('pos_restore_inventory_atomic', {
    p_inventory_id: inventoryId,
    p_quantity: quantity,
    p_target_status: targetStatus,
    p_sellable: sellable,
  });
  if (error) throw new Error(error.message);
  return data as { quantity_on_hand: number; status: string; restocked: boolean };
}

async function handlePaidOrder(client: SupabaseClient, order: Record<string, unknown>) {
  const storeId = await resolveStoreId(client);
  if (!storeId) throw new Error('No POS store is configured.');
  const mapped = await upsertOrder(client, storeId, order, 'paid');
  if (!shouldCreatePosSale(mapped.pos_sale_id as string | null)) {
    const items = Array.isArray(order.line_items) ? order.line_items as Array<Record<string, unknown>> : [];
    for (const line of items) {
      const { data: existing } = await client
        .from('pos_shopify_order_items')
        .select('pos_inventory_item_id')
        .eq('shopify_line_item_id', String(line.id))
        .maybeSingle();
      if (existing?.pos_inventory_item_id) {
        await syncShopifyInventoryForItem(client, {
          inventoryItemId: existing.pos_inventory_item_id as string,
          reason: 'SHOPIFY_ORDER_SOLD',
          storeId,
          posSaleId: mapped.pos_sale_id as string,
          shopifyOrderId: String(order.id),
          direction: 'shopify_to_pos',
        });
      }
    }
    return { ok: true, duplicate: true, saleId: mapped.pos_sale_id };
  }

  const sources = await loadMatchSources(client);
  const lines = (Array.isArray(order.line_items) ? order.line_items as Array<Record<string, unknown>> : [])
    .filter((line) => !line.gift_card);
  const resolved: Array<{
    line: Record<string, unknown>;
    inventoryItemId: string;
    listingId?: string;
    quantity: number;
    unitPrice: number;
    inventory: Record<string, unknown>;
  }> = [];

  for (const line of lines) {
    const match = matchShopifyLineItem({
      shopifyProductId: line.product_id ? `gid://shopify/Product/${line.product_id}` : null,
      shopifyVariantId: line.variant_id ? `gid://shopify/ProductVariant/${line.variant_id}` : null,
      sku: String(line.sku || ''),
      listings: sources.listings,
      inventory: sources.inventory,
    });
    if (!match.ok) {
      throw new Error(`SHOPIFY_LISTING_RECONCILIATION_REQUIRED: ${match.message}`);
    }
    const { data: inventory } = await client
      .from('pos_inventory')
      .select('*')
      .eq('id', match.inventoryItemId)
      .maybeSingle();
    if (!inventory) throw new Error(`POS inventory ${match.inventoryItemId} was not found.`);
    const quantity = Number(line.quantity) || 0;
    const available = Number(inventory.quantity_on_hand) || 0;
    const canSell = canDeductForShopifyOrder(available, quantity);
    if (!canSell.ok) {
      await client.from('pos_shopify_sync_events').insert({
        store_id: storeId,
        direction: 'shopify_to_pos',
        event_type: SHOPIFY_OVERSOLD,
        inventory_item_id: match.inventoryItemId,
        listing_id: match.listingId || null,
        shopify_order_id: String(order.id),
        quantity_before: available,
        quantity_after: available,
        status: 'error',
        error: `Shopify sold ${quantity} but POS quantity is ${available}.`,
        completed_at: new Date().toISOString(),
      });
      await audit(client, storeId, SHOPIFY_OVERSOLD, 'shopify-order', String(order.id),
        `Shopify order ${order.name} oversold POS item ${inventory.device_code}. POS qty=${available}.`);
      return { ok: false, code: SHOPIFY_OVERSOLD, http: 200 };
    }
    resolved.push({
      line,
      inventoryItemId: match.inventoryItemId,
      listingId: match.listingId,
      quantity,
      unitPrice: Number(line.price) || 0,
      inventory,
    });
  }

  const soldAt = new Date().toISOString();
  const deducted: Array<{ inventoryItemId: string; quantity: number }> = [];
  try {
    for (const item of resolved) {
      const result = await sellAtomic(client, item.inventoryItemId, item.quantity, soldAt);
      if (!result.ok) {
        throw Object.assign(new Error(result.message), { code: result.code });
      }
      deducted.push({ inventoryItemId: item.inventoryItemId, quantity: item.quantity });
    }
  } catch (err) {
    for (const item of deducted.reverse()) {
      await restoreAtomic(client, item.inventoryItemId, item.quantity, 'listed', true).catch(() => null);
    }
    const code = (err as { code?: string }).code;
    if (code === SHOPIFY_OVERSOLD) {
      await audit(client, storeId, SHOPIFY_OVERSOLD, 'shopify-order', String(order.id),
        `Shopify order ${order.name} could not deduct POS inventory.`);
      return { ok: false, code: SHOPIFY_OVERSOLD, http: 200 };
    }
    throw err;
  }

  const employeeId = await resolveEmployeeId(client, storeId);
  const taxLines = Array.isArray(order.tax_lines) ? order.tax_lines as Array<{ title?: string; price?: string | number }> : [];
  const tax = splitTax(Number(order.total_tax) || 0, taxLines);
  const subtotal = Number(order.subtotal_price) || resolved.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const total = Number(order.total_price) || subtotal + tax.gst + tax.pst;
  const saleId = generateId('SAL');
  const saleCode = generateCode('S');
  const name = customerName(order);
  const email = String(order.email || '');
  const notes = [
    `Shopify order ${order.name || order.id}`,
    name ? `Customer: ${name}` : '',
    email ? `Email: ${email}` : '',
  ].filter(Boolean).join(' — ');

  const saleInsert = await client.from('pos_sales').insert({
    id: saleId,
    store_id: storeId,
    sale_code: saleCode,
    customer_id: null,
    employee_id: employeeId,
    subtotal,
    gst_total: tax.gst,
    pst_total: tax.pst,
    tax_total: tax.gst + tax.pst,
    total_amount: total,
    sales_channel: 'shopify',
    notes,
    status: 'completed',
    created_at: soldAt,
    completed_at: soldAt,
    shopify_order_id: String(order.id),
    shopify_order_name: String(order.name || ''),
    shopify_customer_name: name || null,
    shopify_customer_email: email || null,
    shopify_order_url: shopifyOrderAdminUrl(shopifyStoreDomain(), String(order.id)),
  });
  if (saleInsert.error) {
    const fallback = await client.from('pos_sales').insert({
      id: saleId,
      store_id: storeId,
      sale_code: saleCode,
      customer_id: null,
      employee_id: employeeId,
      subtotal,
      gst_total: tax.gst,
      pst_total: tax.pst,
      tax_total: tax.gst + tax.pst,
      total_amount: total,
      sales_channel: 'shopify',
      notes,
      status: 'completed',
      created_at: soldAt,
      completed_at: soldAt,
    });
    if (fallback.error) throw new Error(fallback.error.message);
  }

  for (const [index, item] of resolved.entries()) {
    const inv = item.inventory;
    const lineTax = Array.isArray(item.line.tax_lines)
      ? splitTax(
        (item.line.tax_lines as Array<{ price?: string | number }>).reduce((sum, row) => sum + (Number(row.price) || 0), 0),
        item.line.tax_lines as Array<{ title?: string; price?: string | number }>,
      )
      : { gst: 0, pst: 0 };
    const unitPrice = item.unitPrice;
    const lineTotal = unitPrice * item.quantity + lineTax.gst + lineTax.pst;
    const cost = Number(inv.cost_per_unit) || 0;
    const saleItemId = generateId('SLI');
    await client.from('pos_sale_items').insert({
      id: saleItemId,
      sales_transaction_id: saleId,
      inventory_item_id: item.inventoryItemId,
      line_number: index + 1,
      category: inv.category || '',
      brand: inv.brand || '',
      model: inv.model || '',
      serial_imei: inv.serial_imei || '',
      quantity: item.quantity,
      unit_price: unitPrice,
      tax_mode: (lineTax.gst + lineTax.pst) > 0 ? 'both' : 'exempt',
      gst_amount: lineTax.gst,
      pst_amount: lineTax.pst,
      line_total: lineTotal,
      cost_per_unit_snapshot: cost,
      profit_amount: (unitPrice - cost) * item.quantity,
    });
    await client.from('pos_shopify_order_items').upsert({
      id: `SOI-${item.line.id}`,
      shopify_order_id: String(order.id),
      shopify_line_item_id: String(item.line.id),
      shopify_product_id: item.line.product_id ? `gid://shopify/Product/${item.line.product_id}` : null,
      shopify_variant_id: item.line.variant_id ? `gid://shopify/ProductVariant/${item.line.variant_id}` : null,
      sku: String(item.line.sku || ''),
      quantity: item.quantity,
      unit_price: unitPrice,
      pos_inventory_item_id: item.inventoryItemId,
      pos_sale_item_id: saleItemId,
      quantity_refunded: 0,
      quantity_restocked: 0,
      updated_at: soldAt,
    }, { onConflict: 'shopify_line_item_id' });
  }

  await client.from('pos_payments').insert({
    id: generateId('PAY'),
    transaction_type: 'sale',
    transaction_id: saleId,
    line_number: 1,
    method: 'shopify',
    amount: total,
    reference: String(order.name || order.id),
    created_at: soldAt,
  });

  await client.from('pos_shopify_orders').update({
    pos_sale_id: saleId,
    status: 'paid',
    updated_at: soldAt,
  }).eq('shopify_order_id', String(order.id));

  await audit(client, storeId, 'SHOPIFY_ORDER_SOLD', 'sale', saleId,
    `Shopify paid order ${order.name} created POS sale ${saleCode}. Payment method Shopify. No cash drawer movement.`);

  for (const item of resolved) {
    await syncShopifyInventoryForItem(client, {
      inventoryItemId: item.inventoryItemId,
      reason: 'SHOPIFY_ORDER_SOLD',
      storeId,
      posSaleId: saleId,
      shopifyOrderId: String(order.id),
      direction: 'shopify_to_pos',
    });
  }

  return { ok: true, saleId };
}

async function restockLine(
  client: SupabaseClient,
  storeId: string,
  orderId: string,
  lineItemId: string,
  requested: number,
  eventType: 'SHOPIFY_ORDER_CANCELLED' | 'SHOPIFY_REFUND_RESTOCK',
  refundId?: string,
) {
  if (requested <= 0) return { restored: 0 };
  const { data: row } = await client
    .from('pos_shopify_order_items')
    .select('*')
    .eq('shopify_line_item_id', String(lineItemId))
    .maybeSingle();
  if (!row?.pos_inventory_item_id) return { restored: 0, skipped: 'line not deducted' };
  const ordered = Number(row.quantity) || 0;
  const already = Number(row.quantity_restocked) || 0;
  const delta = eventType === 'SHOPIFY_ORDER_CANCELLED'
    ? cancellationRestockQuantity(ordered, already)
    : Math.max(0, Math.min(requested, ordered - already));
  if (delta <= 0) return { restored: 0 };

  const { data: inventory } = await client
    .from('pos_inventory')
    .select('id, listing_method, quantity_on_hand, status')
    .eq('id', row.pos_inventory_item_id)
    .maybeSingle();
  const listingMethod = (inventory?.listing_method as 'shopify' | 'processed_manual' | null) || 'shopify';
  const target = restoreInventoryTarget({ listingMethod, sellable: true });
  const restored = await restoreAtomic(client, row.pos_inventory_item_id as string, delta, target.status, true);
  await client.from('pos_shopify_order_items').update({
    quantity_restocked: already + delta,
    updated_at: new Date().toISOString(),
  }).eq('id', row.id);

  await audit(client, storeId, eventType, 'inventory', row.pos_inventory_item_id as string,
    `${eventType === 'SHOPIFY_ORDER_CANCELLED' ? 'Shopify Cancellation' : 'Shopify Refund'} restored ${delta} to POS inventory.`);

  if (target.relistShopify) {
    await syncShopifyInventoryForItem(client, {
      inventoryItemId: row.pos_inventory_item_id as string,
      reason: eventType,
      storeId,
      shopifyOrderId: orderId,
      shopifyRefundId: refundId || null,
      direction: 'shopify_to_pos',
    });
  }

  return { restored: delta, quantityAfter: restored.quantity_on_hand };
}

async function handleCancelledOrder(client: SupabaseClient, order: Record<string, unknown>) {
  const storeId = await resolveStoreId(client);
  const mapped = await upsertOrder(client, storeId, order, 'cancelled');
  if (!mapped.pos_sale_id) {
    return { ok: true, restored: 0, message: 'Order never deducted POS stock.' };
  }
  const lines = Array.isArray(order.line_items) ? order.line_items as Array<Record<string, unknown>> : [];
  let restored = 0;
  for (const line of lines) {
    const result = await restockLine(client, storeId, String(order.id), String(line.id), Number(line.quantity) || 0, 'SHOPIFY_ORDER_CANCELLED');
    restored += result.restored || 0;
  }
  await client.from('pos_shopify_orders').update({
    status: 'cancelled',
    updated_at: new Date().toISOString(),
  }).eq('shopify_order_id', String(order.id));
  return { ok: true, restored };
}

async function handleRefund(client: SupabaseClient, refund: Record<string, unknown>) {
  const storeId = await resolveStoreId(client);
  const refundId = String(refund.id || '');
  const orderId = String(refund.order_id || '');
  const { data: existingRefund } = await client
    .from('pos_shopify_refunds')
    .select('id')
    .eq('shopify_refund_id', refundId)
    .maybeSingle();
  if (existingRefund) return { ok: true, duplicate: true, restored: 0 };

  const { data: orderRow } = await client
    .from('pos_shopify_orders')
    .select('*')
    .eq('shopify_order_id', orderId)
    .maybeSingle();
  if (!orderRow?.pos_sale_id) {
    return { ok: true, restored: 0, message: 'Refund ignored because POS stock was never deducted.' };
  }

  const refundLines = Array.isArray(refund.refund_line_items)
    ? refund.refund_line_items as Array<Record<string, unknown>>
    : [];
  let restored = 0;
  let anyRestock = false;
  for (const line of refundLines) {
    const lineItem = (line.line_item || {}) as Record<string, unknown>;
    const lineItemId = String(line.line_item_id || lineItem.id || '');
    const restockQty = refundRestockQuantity({
      refundedQuantity: Number(line.quantity) || 0,
      restockType: String(line.restock_type || ''),
      restock: typeof line.restocked === 'boolean' ? line.restocked as boolean : null,
    });
    if (lineItemId) {
      const { data: item } = await client
        .from('pos_shopify_order_items')
        .select('quantity_refunded')
        .eq('shopify_line_item_id', lineItemId)
        .maybeSingle();
      if (item) {
        await client.from('pos_shopify_order_items').update({
          quantity_refunded: (Number(item.quantity_refunded) || 0) + (Number(line.quantity) || 0),
          updated_at: new Date().toISOString(),
        }).eq('shopify_line_item_id', lineItemId);
      }
    }
    if (restockQty > 0 && lineItemId) {
      anyRestock = true;
      const result = await restockLine(client, storeId, orderId, lineItemId, restockQty, 'SHOPIFY_REFUND_RESTOCK', refundId);
      restored += result.restored || 0;
    }
  }

  await client.from('pos_shopify_refunds').upsert({
    id: `SRF-${refundId}`,
    shopify_refund_id: refundId,
    shopify_order_id: orderId,
    restocked: anyRestock,
    processed_at: new Date().toISOString(),
  }, { onConflict: 'shopify_refund_id' });
  const { data: items } = await client
    .from('pos_shopify_order_items')
    .select('quantity, quantity_refunded')
    .eq('shopify_order_id', orderId);
  const rows = items || [];
  const allRefunded = rows.length > 0 && rows.every((row) => (Number(row.quantity_refunded) || 0) >= (Number(row.quantity) || 0));
  const anyRefunded = rows.some((row) => (Number(row.quantity_refunded) || 0) > 0);
  await client.from('pos_shopify_orders').update({
    status: allRefunded ? 'refunded' : anyRefunded ? 'partially_refunded' : 'paid',
    updated_at: new Date().toISOString(),
  }).eq('shopify_order_id', orderId);

  return { ok: true, restored, restocked: anyRestock };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST required.' }, 405);

  const rawBody = await req.text();
  const hmac = header(req, 'X-Shopify-Hmac-Sha256');
  const topicHeader = header(req, 'X-Shopify-Topic');
  const webhookId = header(req, 'X-Shopify-Webhook-Id') || header(req, 'X-Shopify-Event-Id');
  const valid = await verifyShopifyWebhookHmac({
    rawBody,
    hmacHeader: hmac,
    secret: webhookSecret(),
  });
  if (!valid) {
    return json({ ok: false, error: 'Invalid Shopify HMAC.' }, 401);
  }

  const topic = normalizeWebhookTopic(topicHeader);
  const payloadHash = await sha256Hex(rawBody);
  const id = webhookId || payloadHash;
  let payload: Record<string, unknown> = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {};
  } catch {
    return json({ ok: false, error: 'Invalid JSON payload.' }, 400);
  }

  const shopifyOrderId = String(payload.id && topic !== 'refunds/create' ? payload.id : payload.order_id || '');
  const shopifyRefundId = topic === 'refunds/create' ? String(payload.id || '') : null;

  const { data: existing } = await supabase
    .from('pos_shopify_webhook_events')
    .select('*')
    .eq('shopify_webhook_id', id)
    .maybeSingle();
  if (existing && shouldSkipProcessedWebhook(existing.status as string)) {
    return json({ ok: true, duplicate: true }, 200);
  }

  if (!existing) {
    const insert = await supabase.from('pos_shopify_webhook_events').insert({
      shopify_webhook_id: id,
      topic: topicHeader || topic,
      shopify_order_id: shopifyOrderId || null,
      shopify_refund_id: shopifyRefundId,
      status: 'processing',
      payload_hash: payloadHash,
    });
    if (insert.error && /duplicate|unique/i.test(insert.error.message)) {
      return json({ ok: true, duplicate: true }, 200);
    }
  } else {
    await supabase.from('pos_shopify_webhook_events').update({ status: 'processing' }).eq('shopify_webhook_id', id);
  }

  try {
    if (topic === 'ignored') {
      await supabase.from('pos_shopify_webhook_events').update({
        status: 'ignored',
        processed_at: new Date().toISOString(),
      }).eq('shopify_webhook_id', id);
      return json({ ok: true, ignored: true, topic: topicHeader }, 200);
    }

    let result: Record<string, unknown> = {};
    if (topic === 'orders/paid') result = await handlePaidOrder(supabase, payload);
    if (topic === 'orders/cancelled') result = await handleCancelledOrder(supabase, payload);
    if (topic === 'refunds/create') result = await handleRefund(supabase, payload);

    await supabase.from('pos_shopify_webhook_events').update({
      status: 'success',
      processed_at: new Date().toISOString(),
      error: result.code === SHOPIFY_OVERSOLD ? SHOPIFY_OVERSOLD : null,
    }).eq('shopify_webhook_id', id);

    return json({ ok: true, topic, ...result }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook processing failed.';
    await supabase.from('pos_shopify_webhook_events').update({
      status: 'error',
      error: message,
      processed_at: new Date().toISOString(),
    }).eq('shopify_webhook_id', id);
    const retryable = !/RECONCILIATION_REQUIRED|OVERSOLD/i.test(message);
    return json({ ok: false, error: message }, retryable ? 500 : 200);
  }
});
