/**
 * Single holding-period module for the POS.
 *
 * Reuses pos_settings key `holding_period_days` — do not add a second
 * holding-period table or parallel config. If the setting is missing,
 * required days default to 0 so existing stores are not blocked.
 */

export const HOLDING_PERIOD_SETTING_KEY = 'holding_period_days';
export const DEFAULT_HOLDING_PERIOD_DAYS = 0;

export interface HoldingPeriodStatus {
  requiredDays: number;
  daysHeld: number;
  daysRemaining: number;
  completed: boolean;
  label: string;
}

export function parseHoldingPeriodDays(raw: string | null | undefined): number {
  if (raw == null || raw === '') return DEFAULT_HOLDING_PERIOD_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_HOLDING_PERIOD_DAYS;
  return Math.floor(n);
}

export function daysSince(isoDate: string, now = new Date()): number {
  const acquired = new Date(isoDate);
  if (Number.isNaN(acquired.getTime())) return 0;
  const ms = now.getTime() - acquired.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function getHoldingPeriodStatus(
  acquiredAt: string,
  requiredDays: number,
  now = new Date(),
): HoldingPeriodStatus {
  const daysHeld = daysSince(acquiredAt, now);
  const daysRemaining = Math.max(0, requiredDays - daysHeld);
  const completed = daysHeld >= requiredDays;
  const label = requiredDays <= 0
    ? 'Released'
    : completed
      ? `Released (${daysHeld}d)`
      : `Holding ${daysHeld}/${requiredDays}d`;
  return { requiredDays, daysHeld, daysRemaining, completed, label };
}

export function isHoldingPeriodComplete(
  acquiredAt: string,
  requiredDays: number,
  now = new Date(),
): boolean {
  return getHoldingPeriodStatus(acquiredAt, requiredDays, now).completed;
}
