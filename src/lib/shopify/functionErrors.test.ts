import { describe, expect, it } from 'vitest';
import { describeEdgeFunctionError } from './functionErrors';

describe('Edge Function error details', () => {
  it('maps undeployed functions to a 404 message instead of the generic fetch error', () => {
    expect(describeEdgeFunctionError(
      'shopify-photo-session',
      { message: 'Failed to send a request to the Edge Function' },
      null,
      'QR photo session creation failed',
    )).toBe('QR photo session creation failed: function shopify-photo-session returned 404 — function not found.');
  });

  it('maps taxonomy failures with HTTP status and body', () => {
    expect(describeEdgeFunctionError(
      'shopify-taxonomy',
      { message: 'Edge Function returned a non-2xx status code', context: { status: 500 } },
      { error: 'Missing required configuration' },
      'Shopify taxonomy failed',
    )).toBe('Shopify taxonomy failed: function shopify-taxonomy: Missing required configuration');
  });

  it('does not leak tokens', () => {
    const message = describeEdgeFunctionError('shopify-taxonomy', {
      message: 'Bearer shpat_abc123xyz Authorization eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb',
    });
    expect(message).not.toContain('shpat_');
    expect(message).not.toContain('eyJ');
  });
});
