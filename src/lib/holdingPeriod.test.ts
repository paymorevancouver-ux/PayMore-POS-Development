import { describe, expect, it } from 'vitest';
import { getHoldingPeriodStatus, parseHoldingPeriodDays } from './holdingPeriod';

describe('holding period (pos_settings reuse)', () => {
  it('treats a missing setting as zero required days', () => {
    expect(parseHoldingPeriodDays(null)).toBe(0);
    expect(getHoldingPeriodStatus('2026-08-30T00:00:00Z', 0).completed).toBe(true);
  });

  it('marks items inside the hold as incomplete', () => {
    const status = getHoldingPeriodStatus('2026-08-20T00:00:00Z', 15, new Date('2026-08-25T00:00:00Z'));
    expect(status.completed).toBe(false);
    expect(status.daysHeld).toBe(5);
    expect(status.daysRemaining).toBe(10);
  });
});
