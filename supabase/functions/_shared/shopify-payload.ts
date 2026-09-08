const INTERNAL_KEYS = new Set([
  'imei', 'imei1', 'imei2', 'serialNumber', 'serial', 'serialImei',
  'cost', 'costPerUnit', 'staffNotes', 'employeeNotes',
]);

export function isInternalKey(key: string): boolean {
  const leaf = key.split('.').pop() || key;
  return INTERNAL_KEYS.has(key) || INTERNAL_KEYS.has(leaf);
}

export function sanitizeTags(tags: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tag = String(raw || '').trim();
    if (!tag || tag.length > 255) continue;
    if (isInternalKey(tag) || /\b(imei|serial number|cost)\b/i.test(tag)) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 250) break;
  }
  return out;
}

export function descriptionToHtml(description: string): string {
  const text = unescapeEscapedHtml((description || '').replace(/\r\n/g, '\n').trim());
  if (!text) return '';
  if (looksLikeHtml(text)) return text;
  const escape = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return text.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    const heading = lines[0].replace(/[─\-_=]{3,}/g, '').trim();
    const isHeading = lines.length > 1 && (/^[A-Z][A-Za-z /&]+$/.test(heading) || /^[─\-_=]{3,}$/.test(lines[1] || ''));
    if (isHeading) {
      const body = lines.slice(1).filter((l) => !/^[─\-_=]{3,}$/.test(l));
      const items = body.filter((l) => l.startsWith('•') || l.startsWith('-'));
      const paras = body.filter((l) => !l.startsWith('•') && !l.startsWith('-'));
      const list = items.length ? `<ul>${items.map((i) => `<li>${escape(i.replace(/^[•\-]\s*/, ''))}</li>`).join('')}</ul>` : '';
      return `<h3>${escape(heading)}</h3>${paras.map((p) => `<p>${escape(p)}</p>`).join('')}${list}`;
    }
    return `<p>${escape(lines.join(' '))}</p>`;
  }).join('');
}

export function looksLikeHtml(value: string): boolean {
  return /<(div|h1|h2|h3|h4|table|ul|ol|p|span|br|hr)\b/i.test(String(value || ''));
}

export function descriptionHtmlLooksEscaped(value: string): boolean {
  const text = String(value || '').trim();
  return text.startsWith('&lt;') || text.startsWith('&amp;lt;') || text.startsWith('&amp;amp;lt;');
}

export function unescapeEscapedHtml(value: string): string {
  const text = String(value || '');
  if (!descriptionHtmlLooksEscaped(text) && !text.includes('&lt;div') && !text.includes('&lt;h1')) return text;
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

export function approvedDescriptionHtml(description: string): string {
  const text = unescapeEscapedHtml((description || '').replace(/\r\n/g, '\n').trim());
  if (!text) return '';
  if (looksLikeHtml(text)) return text;
  return descriptionToHtml(text);
}

export function publishStepError(step: string, message: string): string {
  return `${step}: ${String(message || 'failed').trim()}`.slice(0, 500);
}

export function descriptionVerificationIssue(sentHtml: string, shopifyDescriptionHtml: string | null | undefined): string | null {
  const sent = String(sentHtml || '').trim();
  const got = String(shopifyDescriptionHtml || '').trim();
  if (!sent) return null;
  if (descriptionHtmlLooksEscaped(got)) {
    return publishStepError('DESCRIPTION_VERIFY', 'Shopify descriptionHtml stored escaped HTML instead of rendered HTML.');
  }
  if (looksLikeHtml(sent) && descriptionHtmlLooksEscaped(sent)) {
    return publishStepError('DESCRIPTION_VERIFY', 'POS description was HTML-escaped before publish.');
  }
  if (looksLikeHtml(sent) && !looksLikeHtml(got) && /<(div|h1)\b/i.test(sent)) {
    return publishStepError('DESCRIPTION_VERIFY', 'Shopify descriptionHtml did not keep the approved HTML.');
  }
  return null;
}

export interface ShopifyVariantSnapshot {
  id?: string | null;
  sku?: string | null;
  barcode?: string | null;
  title?: string | null;
  inventoryItem?: { id?: string | null } | null;
}

export function chooseInitialVariant(nodes: ShopifyVariantSnapshot[] | null | undefined): ShopifyVariantSnapshot | null {
  const list = (nodes || []).filter((row) => row?.id);
  if (!list.length) return null;
  return list.find((row) => /default title/i.test(String(row.title || ''))) || list[0];
}

export function unexpectedVariantCountMessage(count: number): string | null {
  if (count === 1) return null;
  return publishStepError('VARIANT_VERIFY', `Unexpected Shopify variant count. Expected 1, found ${count}.`);
}

export type SkuLookupDecision =
  | { action: 'create' }
  | { action: 'adopt'; productId: string; variantId: string; inventoryItemId: string }
  | { action: 'duplicate'; message: string };

export function skuLookupDecision(
  sku: string,
  matches: Array<{ productId: string; variantId: string; inventoryItemId?: string; sku?: string | null }>,
): SkuLookupDecision {
  const wanted = String(sku || '').trim().toUpperCase();
  const exact = matches.filter((row) => String(row.sku || '').trim().toUpperCase() === wanted && row.productId);
  const uniqueProducts = [...new Set(exact.map((row) => row.productId))];
  if (uniqueProducts.length === 0) return { action: 'create' };
  if (uniqueProducts.length > 1) {
    return {
      action: 'duplicate',
      message: publishStepError('SKU_LOOKUP', 'Duplicate Shopify SKU detected — manual reconciliation required.'),
    };
  }
  const hit = exact.find((row) => row.productId === uniqueProducts[0])!;
  return {
    action: 'adopt',
    productId: hit.productId,
    variantId: hit.variantId,
    inventoryItemId: hit.inventoryItemId || '',
  };
}

export function costsMatch(posCost: number, shopifyAmount: string | number | null | undefined): boolean {
  const left = Number(posCost);
  const right = Number(shopifyAmount);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) < 0.015;
}

export function categoryIdsMatch(expected: string, actual?: string | null): boolean {
  const left = String(expected || '').trim();
  const right = String(actual || '').trim();
  return Boolean(left) && left === right;
}

export function photoSourceKind(value: string | null | undefined, path?: string | null): 'http' | 'data-url' | 'storage-path' | 'empty' | 'unsupported' {
  const raw = String(value || '').trim();
  const storagePath = String(path || '').trim();
  if (!raw && !storagePath) return 'empty';
  if (raw.startsWith('data:image/')) return 'data-url';
  if (/^https?:\/\//i.test(raw)) return 'http';
  if (storagePath || (!raw.startsWith('data:') && raw.includes('/'))) return 'storage-path';
  return 'unsupported';
}

export function listingPhotoAssets(photos: unknown): Array<{ url: string; path?: string; kind: ReturnType<typeof photoSourceKind>; index: number }> {
  if (!Array.isArray(photos)) return [];
  return photos.map((photo, index) => {
    if (typeof photo === 'string') return { url: photo.trim(), kind: photoSourceKind(photo), index };
    if (photo && typeof photo === 'object') {
      const row = photo as { url?: string; path?: string };
      const url = String(row.url || '').trim();
      const path = String(row.path || '').trim() || undefined;
      return { url, path, kind: photoSourceKind(url, path), index };
    }
    return { url: '', kind: 'empty' as const, index };
  }).filter((row) => row.kind !== 'empty');
}

function attr(attributes: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let cur: unknown = attributes;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[part];
  }
  const text = cur == null ? '' : String(cur).trim();
  if (!text || ['unknown', 'not applicable', 'n/a', 'na'].includes(text.toLowerCase())) return '';
  return text;
}

const METAFIELD_MAP: Array<{ key: string; metafield: string }> = [
  { key: 'cosmeticCondition', metafield: 'condition' },
  { key: 'cpu.model', metafield: 'cpu' },
  { key: 'cpu.family', metafield: 'cpu' },
  { key: 'gpu.model', metafield: 'gpu' },
  { key: 'ram.total', metafield: 'ram' },
  { key: 'storage.primaryCapacity', metafield: 'storage' },
  { key: 'display.size', metafield: 'screen_size' },
  { key: 'battery.health', metafield: 'battery_health' },
  { key: 'cameraType', metafield: 'camera_type' },
  { key: 'megapixels', metafield: 'megapixels' },
  { key: 'sensorSize', metafield: 'sensor_size' },
  { key: 'chip', metafield: 'apple_chip' },
];

export function publicMetafields(
  attributes: Record<string, unknown>,
  condition?: string,
): Array<{ namespace: string; key: string; type: string; value: string }> {
  const out: Array<{ namespace: string; key: string; type: string; value: string }> = [];
  const used = new Set<string>();
  if (condition?.trim()) {
    out.push({ namespace: 'paymore', key: 'condition', type: 'single_line_text_field', value: condition.trim() });
    used.add('condition');
  }
  for (const map of METAFIELD_MAP) {
    if (used.has(map.metafield) || isInternalKey(map.key)) continue;
    const value = attr(attributes || {}, map.key);
    if (!value) continue;
    out.push({ namespace: 'paymore', key: map.metafield, type: 'single_line_text_field', value: value.slice(0, 255) });
    used.add(map.metafield);
  }
  return out.filter((f) => !isInternalKey(f.key));
}

export function listingPhotoSources(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  return photos.map((photo) => {
    if (typeof photo === 'string') return photo.trim();
    if (photo && typeof photo === 'object' && 'url' in photo) return String((photo as { url?: string }).url || '').trim();
    return '';
  }).filter(Boolean);
}

export function isShopifyTaxonomyCategoryId(value?: string | null): boolean {
  return /^gid:\/\/shopify\/TaxonomyCategory\/[A-Za-z0-9-]+$/.test(String(value || '').trim());
}

export function productSetCategory(listing: Record<string, unknown>): string | undefined {
  const id = String(listing.shopify_category_id || listing.shopifyCategoryId || '').trim();
  return isShopifyTaxonomyCategoryId(id) ? id : undefined;
}

export function shopifyCategoryRequiredMessage(listing: Record<string, unknown>): string {
  const id = String(listing.shopify_category_id || listing.shopifyCategoryId || '').trim();
  const confirmed = listing.shopify_category_confirmed === true || listing.shopifyCategoryConfirmed === true;
  return `A real Shopify Standard Product Taxonomy category is required. SHOPIFY_CATEGORY_REQUIRED: category_id_present=${Boolean(id)}, category_confirmed=${confirmed}`;
}

export function listingHasConfirmedTaxonomy(listing: Record<string, unknown>): boolean {
  const confirmed = listing.shopify_category_confirmed === true || listing.shopifyCategoryConfirmed === true;
  return Boolean(productSetCategory(listing)) && confirmed;
}

function listingField(listing: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = listing[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return '';
}

export function buildProductCreatePayload(listing: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: listingField(listing, 'title'),
    descriptionHtml: approvedDescriptionHtml(listingField(listing, 'description')),
    vendor: listingField(listing, 'shopifyVendor', 'shopify_vendor'),
    productType: listingField(listing, 'shopifyProductType', 'shopify_product_type'),
    tags: sanitizeTags(listing.tags),
    status: 'DRAFT',
  };
  const category = productSetCategory(listing);
  if (category) payload.category = category;
  return payload;
}

export function buildProductUpdatePayload(
  listing: Record<string, unknown>,
  extras: { descriptionHtml?: string; categoryId?: string } = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: listingField(listing, 'title'),
    descriptionHtml: extras.descriptionHtml ?? approvedDescriptionHtml(listingField(listing, 'description')),
    vendor: listingField(listing, 'shopifyVendor', 'shopify_vendor'),
    productType: listingField(listing, 'shopifyProductType', 'shopify_product_type'),
    tags: sanitizeTags(listing.tags),
  };
  const category = extras.categoryId || productSetCategory(listing);
  if (category) payload.category = category;
  return payload;
}

export function buildCategorySetPayload(categoryId: string): Record<string, unknown> {
  return { category: categoryId };
}

export function buildDescriptionSetPayload(descriptionHtml: string): Record<string, unknown> {
  return { descriptionHtml };
}

export function buildVariantUpdatePayload(input: {
  variantId: string;
  sku: string;
  barcode: string;
  price: number | string;
  compareAtPrice?: number | string | null;
  taxable?: boolean;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: input.variantId,
    price: String(Number(input.price).toFixed(2)),
    barcode: input.barcode,
    inventoryItem: { sku: input.sku, tracked: true },
  };
  if (input.compareAtPrice != null && Number(input.compareAtPrice) > 0) {
    payload.compareAtPrice = String(Number(input.compareAtPrice).toFixed(2));
  }
  if (input.taxable != null) payload.taxable = input.taxable;
  return payload;
}

export function payloadHasVariants(payload: Record<string, unknown> | null | undefined): boolean {
  return Boolean(payload && Object.prototype.hasOwnProperty.call(payload, 'variants'));
}

export function graphqlInputHasNullOptionValues(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some(graphqlInputHasNullOptionValues);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(obj, 'optionValues') && obj.optionValues == null) return true;
    return Object.values(obj).some(graphqlInputHasNullOptionValues);
  }
  return false;
}

export function productSetCreateOmitsVariants(input: Record<string, unknown>): boolean {
  return !payloadHasVariants(input) && input.productOptions == null;
}

export function productSetUpdateOmitsVariants(
  identifier: { id?: string } | null | undefined,
  input: Record<string, unknown>,
): boolean {
  return Boolean(identifier?.id) && input.id == null && !payloadHasVariants(input);
}

export function categoryMetafields(listing: Record<string, unknown>): Array<{ namespace: string; key: string; type: string; value: string }> {
  const attributes = (listing.attributes && typeof listing.attributes === 'object')
    ? listing.attributes as Record<string, unknown>
    : {};
  const taxonomy = Array.isArray(attributes.__taxonomyAttributes)
    ? attributes.__taxonomyAttributes as Array<{ handle?: string; name?: string }>
    : Array.isArray(listing.shopifyTaxonomyAttributes)
      ? listing.shopifyTaxonomyAttributes as Array<{ handle?: string; name?: string }>
      : [];
  if (!taxonomy.length) return [];
  const candidates: Array<{ match: RegExp; value: string }> = [
    { match: /color/i, value: attr(attributes, 'color') },
    { match: /capacity|storage/i, value: attr(attributes, 'storage.primaryCapacity') },
    { match: /size/i, value: attr(attributes, 'display.size') },
  ];
  const out: Array<{ namespace: string; key: string; type: string; value: string }> = [];
  for (const item of taxonomy) {
    const handle = String(item.handle || item.name || '').trim();
    if (!handle || isInternalKey(handle)) continue;
    const hit = candidates.find((row) => row.match.test(handle) && row.value);
    if (!hit) continue;
    out.push({
      namespace: 'shopify',
      key: handle.slice(0, 64).replace(/\s+/g, '_').toLowerCase(),
      type: 'single_line_text_field',
      value: hit.value.slice(0, 255),
    });
  }
  return out;
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function parseDataUrl(value: string): { mime: string; bytes: Uint8Array; filename: string } | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1] || 'image/jpeg';
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return { mime, bytes, filename: `listing-${Date.now()}.${ext}` };
}

export function holdingComplete(acquiredAt: string, requiredDays: number): boolean {
  if (!acquiredAt || requiredDays <= 0) return true;
  const acquired = new Date(acquiredAt);
  if (Number.isNaN(acquired.getTime())) return true;
  const days = Math.floor((Date.now() - acquired.getTime()) / 86_400_000);
  return days >= requiredDays;
}

export function barcodeForShopify(barcode: string | null | undefined): string {
  const value = String(barcode || '').trim();
  if (!value) return '';
  if (/imei|serial/i.test(value)) return '';
  if (/^\d{15,17}$/.test(value)) return '';
  if (/^[A-Z]{2,}\d{0,2}-\d+$/i.test(value)) return '';
  const digits = value.replace(/\D/g, '');
  if (!digits || digits.length < 8 || digits.length > 14) return '';
  return value;
}
