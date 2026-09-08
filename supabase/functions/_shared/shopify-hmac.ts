function bytesOf(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function toBase64(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin);
}

export function timingSafeEqual(left: string, right: string): boolean {
  const a = bytesOf(left);
  const b = bytesOf(right);
  const length = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < length; i += 1) {
    mismatch |= (a[i] || 0) ^ (b[i] || 0);
  }
  return mismatch === 0;
}

export async function computeShopifyHmacBase64(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    bytesOf(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, bytesOf(rawBody));
  return toBase64(signature);
}

export async function verifyShopifyWebhookHmac(input: {
  rawBody: string;
  hmacHeader?: string | null;
  secret?: string | null;
}): Promise<boolean> {
  const header = String(input.hmacHeader || '').trim();
  const secret = String(input.secret || '').trim();
  if (!header || !secret) return false;
  const computed = await computeShopifyHmacBase64(input.rawBody, secret);
  return timingSafeEqual(computed, header);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytesOf(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
