import { describe, expect, it } from 'vitest';
import {
  evaluatePhotoSession,
  generatePhotoSessionToken,
  isSafePublicPhotoSessionPayload,
  photoSessionExpiresAt,
  photoUploadPublicPath,
} from './photoSessions';

describe('QR photo upload sessions', () => {
  it('generates an unguessable listing-independent token', () => {
    const seen = new Set<string>();
    let n = 0;
    const token = generatePhotoSessionToken(() => {
      n += 1;
      return (n % 97) / 97;
    });
    const other = generatePhotoSessionToken(() => Math.random());
    expect(token).toMatch(/^[A-Za-z0-9-]{32,}$/);
    expect(token.includes('listing')).toBe(false);
    expect(photoUploadPublicPath(token)).toBe(`/shopify-photo-upload/${token}`);
    expect(photoUploadPublicPath(token)).not.toContain('listing_id');
    seen.add(token);
    seen.add(other);
    expect(seen.size).toBe(2);
  });

  it('blocks expired sessions', () => {
    const result = evaluatePhotoSession({
      status: 'active',
      expiresAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      listingId: 'SFL-1',
    }, 'SFL-1', new Date('2026-01-01T00:31:00.000Z'));
    expect(result.allowed).toBe(false);
    expect(result.status).toBe('expired');
  });

  it('blocks a token bound to a different listing', () => {
    const result = evaluatePhotoSession({
      status: 'active',
      expiresAt: photoSessionExpiresAt(new Date('2026-09-04T02:00:00.000Z')),
      listingId: 'SFL-1',
    }, 'SFL-2', new Date('2026-09-04T02:05:00.000Z'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not for the selected listing/i);
  });

  it('allows an active unexpired session for the matching listing', () => {
    const now = new Date('2026-09-04T02:00:00.000Z');
    const result = evaluatePhotoSession({
      status: 'active',
      expiresAt: photoSessionExpiresAt(now),
      listingId: 'SFL-1',
    }, 'SFL-1', now);
    expect(result.allowed).toBe(true);
  });

  it('does not expose cost, customer, or employee secrets in public payloads', () => {
    expect(isSafePublicPhotoSessionPayload({
      title: 'Apple iPhone 15 Pro',
      sku: 'BC05-000623',
      photos: [{ id: 'p1', url: 'https://signed.example/p1.jpg' }],
    })).toBe(true);
    expect(isSafePublicPhotoSessionPayload({
      title: 'iPhone',
      cost: 400,
    })).toBe(false);
  });
});
