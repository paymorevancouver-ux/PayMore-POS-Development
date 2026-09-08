import { SHOPIFY_PHOTO_SESSION_MINUTES } from '@/lib/shopify/constants';

export type ShopifyPhotoSessionStatus = 'active' | 'completed' | 'expired' | 'cancelled';

export interface ShopifyPhotoSession {
  sessionToken: string;
  listingId: string;
  storeId: string;
  employeeId?: string | null;
  status: ShopifyPhotoSessionStatus;
  createdAt: string;
  expiresAt: string;
  completedAt?: string | null;
}

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generatePhotoSessionToken(random: () => number = Math.random): string {
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let seg = '';
    for (let i = 0; i < 8; i++) seg += TOKEN_CHARS[Math.floor(random() * TOKEN_CHARS.length)];
    segments.push(seg);
  }
  return segments.join('-');
}

export function photoSessionExpiresAt(now = new Date(), minutes = SHOPIFY_PHOTO_SESSION_MINUTES): string {
  return new Date(now.getTime() + minutes * 60 * 1000).toISOString();
}

export function evaluatePhotoSession(
  session: Pick<ShopifyPhotoSession, 'status' | 'expiresAt' | 'listingId'> | null | undefined,
  expectedListingId?: string,
  now = new Date(),
): { allowed: boolean; status: ShopifyPhotoSessionStatus | 'missing'; reason?: string } {
  if (!session) return { allowed: false, status: 'missing', reason: 'Upload session was not found.' };
  if (expectedListingId && session.listingId !== expectedListingId) {
    return { allowed: false, status: session.status, reason: 'This upload link is not for the selected listing.' };
  }
  if (session.status === 'cancelled') {
    return { allowed: false, status: 'cancelled', reason: 'This upload session was cancelled.' };
  }
  if (session.status === 'completed') {
    return { allowed: false, status: 'completed', reason: 'This upload session is already complete.' };
  }
  if (session.status === 'expired' || new Date(session.expiresAt).getTime() <= now.getTime()) {
    return { allowed: false, status: 'expired', reason: 'This upload session has expired.' };
  }
  if (session.status !== 'active') {
    return { allowed: false, status: session.status, reason: 'This upload session is not active.' };
  }
  return { allowed: true, status: 'active' };
}

export function photoUploadPublicPath(token: string): string {
  return `/shopify-photo-upload/${encodeURIComponent(token)}`;
}

export function isSafePublicPhotoSessionPayload(payload: Record<string, unknown>): boolean {
  const blocked = ['cost', 'costPerUnit', 'staffNotes', 'employeeNotes', 'customer', 'cash', 'password', 'token'];
  const json = JSON.stringify(payload).toLowerCase();
  return !blocked.some((key) => new RegExp(`"${key.toLowerCase()}"\\s*:`).test(json));
}
