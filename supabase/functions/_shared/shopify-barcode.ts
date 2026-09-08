const IMEI_SERIAL_RE = /imei|serial/i;
const DEVICE_CODE_RE = /^[A-Z]{2,}\d{0,2}-\d+$/i;

export const BARCODE_MISMATCH_MESSAGE = 'Barcode mismatch. POS barcode and Shopify barcode are different.';
export const COST_UPDATE_FAILED_MESSAGE = 'Shopify product created, but inventory cost could not be updated.';

export function upcACheckDigit(body11: string): string {
  const digits = body11.replace(/\D/g, '').slice(0, 11).padStart(11, '0').split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += digits[i] * (i % 2 === 0 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

export function buildUpcA(body11: string): string {
  const body = body11.replace(/\D/g, '').slice(0, 11).padStart(11, '0');
  return `${body}${upcACheckDigit(body)}`;
}

export function normalizeBarcode(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function barcodeDigits(value: string | null | undefined): string {
  return normalizeBarcode(value).replace(/\D/g, '');
}

export function barcodesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = barcodeDigits(a) || normalizeBarcode(a);
  const right = barcodeDigits(b) || normalizeBarcode(b);
  return Boolean(left) && left === right;
}

export function looksLikeImeiOrSerial(value: string | null | undefined, serialImei?: string | null): boolean {
  const raw = normalizeBarcode(value);
  if (!raw) return false;
  if (IMEI_SERIAL_RE.test(raw)) return true;
  if (/^\d{15,17}$/.test(raw)) return true;
  const serial = normalizeBarcode(serialImei);
  return Boolean(serial) && raw === serial;
}

export function looksLikeDeviceCode(value: string | null | undefined): boolean {
  return DEVICE_CODE_RE.test(normalizeBarcode(value));
}

export function isReusableRetailBarcode(
  value: string | null | undefined,
  identity?: { deviceCode?: string | null; sku?: string | null; serialImei?: string | null },
): boolean {
  const raw = normalizeBarcode(value);
  if (!raw) return false;
  if (looksLikeImeiOrSerial(raw, identity?.serialImei)) return false;
  if (looksLikeDeviceCode(raw)) return false;
  const sku = normalizeBarcode(identity?.sku || identity?.deviceCode);
  if (sku && raw.toUpperCase() === sku.toUpperCase()) return false;
  const digits = barcodeDigits(raw);
  if (!digits) return false;
  if (digits.length < 8 || digits.length > 14) return false;
  return true;
}

export function barcodeForShopify(
  value: string | null | undefined,
  identity?: { deviceCode?: string | null; sku?: string | null; serialImei?: string | null },
): string {
  return isReusableRetailBarcode(value, identity) ? normalizeBarcode(value) : '';
}

export function deviceCodeToUpcBody(deviceCode: string): string | null {
  const match = normalizeBarcode(deviceCode).toUpperCase().match(/^([A-Z]+)(\d+)-(\d+)$/);
  if (!match) return null;
  const store = match[2].slice(-2).padStart(2, '0');
  const seq = match[3].slice(-8).padStart(8, '0');
  return `4${store}${seq}`;
}

function hashTo11(seed: string): string {
  let n = 2166136261;
  for (let i = 0; i < seed.length; i++) n ^= seed.charCodeAt(i) * (n + i + 1);
  const body = Math.abs(n % 10_000_000_000).toString().padStart(10, '0');
  return `4${body}`.slice(0, 11);
}

function incrementUpcBody(body11: string, by: number): string {
  const num = BigInt(body11.replace(/\D/g, '').padStart(11, '0') || '0') + BigInt(by);
  return num.toString().slice(-11).padStart(11, '0');
}

export function generateRetailBarcode(input: {
  deviceCode: string;
  inventoryId: string;
  taken: Set<string>;
}): string {
  const baseBody = deviceCodeToUpcBody(input.deviceCode) || hashTo11(`${input.inventoryId}:${input.deviceCode}`);
  for (let i = 0; i < 50; i++) {
    const candidate = buildUpcA(incrementUpcBody(baseBody, i));
    if (!input.taken.has(candidate) && !input.taken.has(barcodeDigits(candidate))) return candidate;
  }
  throw new Error('Could not generate a unique barcode.');
}

export function resolveExistingBarcode(input: {
  inventoryBarcode?: string | null;
  listingBarcode?: string | null;
  upcSku?: string | null;
  deviceCode?: string | null;
  sku?: string | null;
  serialImei?: string | null;
}): string {
  const identity = { deviceCode: input.deviceCode, sku: input.sku, serialImei: input.serialImei };
  for (const candidate of [input.inventoryBarcode, input.listingBarcode, input.upcSku]) {
    const usable = barcodeForShopify(candidate, identity);
    if (usable) return usable;
  }
  return '';
}

export function detectBarcodeMismatch(posBarcode: string, shopifyBarcode: string): string | null {
  if (!posBarcode || !shopifyBarcode) return BARCODE_MISMATCH_MESSAGE;
  if (!barcodesEqual(posBarcode, shopifyBarcode)) return BARCODE_MISMATCH_MESSAGE;
  return null;
}

export function inventoryItemCostUpdateInput(cost: number): { cost: string; tracked: true } {
  const amount = Number.isFinite(Number(cost)) ? Number(cost) : 0;
  return { cost: amount.toFixed(2), tracked: true };
}
