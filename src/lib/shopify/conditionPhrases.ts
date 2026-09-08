import {
  COSMETIC_CONDITION_OPTIONS,
  FUNCTIONALITY_CONDITION_OPTIONS,
  PHOTO_CONDITION_SENTENCE,
  type CosmeticConditionKey,
  type FunctionalityConditionKey,
} from '@/config/shopifyConditionPhrases';
import type { ShopifyTestResult } from '@/types/shopify';

const COSMETIC_BY_KEY = new Map(COSMETIC_CONDITION_OPTIONS.map((opt) => [opt.key, opt]));
const FUNCTIONALITY_BY_KEY = new Map(FUNCTIONALITY_CONDITION_OPTIONS.map((opt) => [opt.key, opt]));

const POS_COSMETIC_MAP: Array<{ match: RegExp; key: CosmeticConditionKey }> = [
  { match: /^(new[_\s-]*sealed|new)$/i, key: 'NEW_SEALED' },
  { match: /^(new[_\s-]*no[_\s-]*seal|open[_\s-]*box)$/i, key: 'NEW_NO_SEAL' },
  { match: /^(flawless|mint)$/i, key: 'FLAWLESS' },
  { match: /^(excellent|very[_\s-]*good)$/i, key: 'VERY_GOOD' },
  { match: /^good$/i, key: 'GOOD' },
  { match: /^fair$/i, key: 'FAIR' },
  { match: /^poor$/i, key: 'POOR' },
  { match: /^(broken|for[_\s-]*parts)/i, key: 'BROKEN' },
];

export function getCosmeticOption(key?: string | null) {
  return COSMETIC_BY_KEY.get(String(key || '') as CosmeticConditionKey);
}

export function getFunctionalityOption(key?: string | null) {
  return FUNCTIONALITY_BY_KEY.get(String(key || '') as FunctionalityConditionKey);
}

export function mapPosConditionToCosmetic(condition?: string | null): CosmeticConditionKey | '' {
  const value = String(condition || '').trim();
  if (!value) return '';
  const hit = POS_COSMETIC_MAP.find((row) => row.match.test(value));
  return hit?.key || '';
}

export function buildCosmeticPhrase(
  key?: string | null,
  extraNotes = '',
  includePhotoSentence = true,
): string {
  const option = getCosmeticOption(key);
  if (!option) return extraNotes.trim();
  const parts = [option.phrase];
  if (includePhotoSentence && option.used !== false) parts.push(PHOTO_CONDITION_SENTENCE);
  if (extraNotes.trim()) parts.push(extraNotes.trim());
  return parts.join(' ');
}

export function buildFunctionalityPhrase(key?: string | null, extraNotes = ''): string {
  const option = getFunctionalityOption(key);
  if (!option) return extraNotes.trim();
  const parts = [option.phrase];
  if (extraNotes.trim()) parts.push(extraNotes.trim());
  return parts.join(' ');
}

export function allApplicableTestsPassed(
  tests: Array<{ id: string }>,
  results: Record<string, ShopifyTestResult>,
): boolean {
  const applicable = tests.filter((test) => (results[test.id] || 'not-tested') !== 'not-applicable');
  if (applicable.length === 0) return false;
  return applicable.every((test) => results[test.id] === 'pass');
}

export function suggestFunctionalityFromTests(
  tests: Array<{ id: string }>,
  results: Record<string, ShopifyTestResult>,
  current?: string | null,
): FunctionalityConditionKey | '' {
  if (current) return current as FunctionalityConditionKey;
  const values = tests.map((test) => results[test.id] || 'not-tested');
  if (values.some((value) => value === 'fail')) return 'PARTIALLY_FUNCTIONAL';
  if (allApplicableTestsPassed(tests, results)) return 'FULLY_FUNCTIONAL';
  return '';
}

export function markAllTestsPass(
  tests: Array<{ id: string }>,
  results: Record<string, ShopifyTestResult>,
): Record<string, ShopifyTestResult> {
  const next = { ...results };
  for (const test of tests) {
    if (next[test.id] !== 'not-applicable') next[test.id] = 'pass';
  }
  return next;
}
