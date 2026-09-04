import { getSpecCategory, isInternalOnlyField, isPublicField } from '@/config/productSpecifications';
import { getAttributeValue } from '@/lib/shopify/attributes';

const INTERNAL_ATTRIBUTE_KEYS = new Set([
  'imei',
  'imei1',
  'imei2',
  'serialNumber',
  'serial',
  'serialImei',
  'cost',
  'costPerUnit',
  'staffNotes',
  'employeeNotes',
]);

export function isInternalAttributeKey(key: string): boolean {
  const leaf = key.split('.').pop() || key;
  return INTERNAL_ATTRIBUTE_KEYS.has(key) || INTERNAL_ATTRIBUTE_KEYS.has(leaf);
}

export function filterPublicAttributes(
  categoryKey: string,
  brand: string,
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const category = getSpecCategory(categoryKey, brand);
  const publicKeys = new Set(
    category.fields.filter((field) => isPublicField(field) && !isInternalOnlyField(field)).map((f) => f.key),
  );
  const out: Record<string, unknown> = {};
  for (const field of category.fields) {
    if (!publicKeys.has(field.key)) continue;
    if (isInternalAttributeKey(field.key)) continue;
    const value = getAttributeValue(attributes, field.key);
    if (value === '' || value == null) continue;
    out[field.key] = value;
  }
  return out;
}

export function assertNoInternalLeak(text: string): string[] {
  const leaks: string[] = [];
  const lower = text.toLowerCase();
  if (/\bimei\b/.test(lower)) leaks.push('IMEI');
  if (/\bserial number\b/.test(lower)) leaks.push('Serial Number');
  if (/\bcost\b/.test(lower) || /\bcost per unit\b/.test(lower)) leaks.push('Cost');
  if (/\bstaff notes?\b/.test(lower) || /\bemployee notes?\b/.test(lower)) leaks.push('Employee notes');
  return leaks;
}
