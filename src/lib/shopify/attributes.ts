import { UNKNOWN_VALUES } from '@/lib/shopify/constants';
import type { SpecFieldDefinition } from '@/config/productSpecifications';

export function getAttributeValue(attributes: Record<string, unknown> | undefined, path: string): unknown {
  if (!attributes || !path) return '';
  if (Object.prototype.hasOwnProperty.call(attributes, path)) return attributes[path];
  const parts = path.split('.');
  let cur: unknown = attributes;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur ?? '';
}

export function setAttributeValue(
  attributes: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split('.');
  const next: Record<string, unknown> = { ...attributes };
  if (parts.length === 1) {
    next[parts[0]] = value;
    return next;
  }
  const [head, ...rest] = parts;
  const child = (next[head] && typeof next[head] === 'object' && !Array.isArray(next[head]))
    ? { ...(next[head] as Record<string, unknown>) }
    : {};
  let cursor = child;
  for (let i = 0; i < rest.length - 1; i++) {
    const key = rest[i];
    const existing = cursor[key];
    cursor[key] = existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[rest[rest.length - 1]] = value;
  next[head] = child;
  return next;
}

export function attributeDisplay(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).trim();
}

export function isUsablePublicValue(value: unknown): boolean {
  const text = attributeDisplay(value);
  if (!text) return false;
  return !UNKNOWN_VALUES.has(text.toLowerCase());
}

export function formatFieldValue(field: SpecFieldDefinition, value: unknown): string {
  const text = attributeDisplay(value);
  if (!text) return '';
  if (field.titleFormat) return field.titleFormat.replace('{value}', text);
  return text;
}

export function flattenAttributes(attributes: Record<string, unknown>, prefix = ''): Array<{ key: string; value: unknown }> {
  const rows: Array<{ key: string; value: unknown }> = [];
  for (const [key, value] of Object.entries(attributes)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      rows.push(...flattenAttributes(value as Record<string, unknown>, path));
    } else {
      rows.push({ key: path, value });
    }
  }
  return rows;
}
