import {
  getSpecCategory,
  isPublicField,
  type SpecCategoryDefinition,
} from '@/config/productSpecifications';
import { formatFieldValue, getAttributeValue, isUsablePublicValue } from '@/lib/shopify/attributes';

export interface TitleGeneratorInput {
  categoryKey?: string;
  categoryLabel?: string;
  brand: string;
  model: string;
  attributes?: Record<string, unknown>;
  extraTitleText?: string;
}

function uniqueParts(parts: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const text = (part || '').trim();
    if (!text || !isUsablePublicValue(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function generateShopifyTitle(input: TitleGeneratorInput): string {
  const category = getSpecCategory(input.categoryKey || input.categoryLabel || '', input.brand);
  const attributes = input.attributes || {};
  const brand = (getAttributeValue(attributes, 'brand') as string) || input.brand;
  const model = (getAttributeValue(attributes, 'model') as string) || input.model;

  const titleFields = category.fields
    .filter((field) => field.includeInTitle && isPublicField(field))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const fromFields = titleFields
    .filter((field) => field.key !== 'brand' && field.key !== 'model')
    .map((field) => formatFieldValue(field, getAttributeValue(attributes, field.key)));

  const suffix = inferTitleSuffix(category, attributes);
  const extra = (input.extraTitleText || '').trim();
  return uniqueParts([brand, model, ...fromFields, suffix, extra]).join(' ');
}

function inferTitleSuffix(category: SpecCategoryDefinition, attributes: Record<string, unknown>): string {
  if (category.key === 'windows-laptop') {
    const gpuType = String(getAttributeValue(attributes, 'gpu.type') || '');
    const gpuModel = String(getAttributeValue(attributes, 'gpu.model') || '');
    if (/dedicated|both/i.test(gpuType) || /rtx|gtx|radeon|rx /i.test(gpuModel)) {
      return 'Gaming Laptop';
    }
    return category.titleSuffix || 'Laptop';
  }
  if (category.key === 'mirrorless-camera' || category.key === 'dslr-camera') {
    const kit = String(getAttributeValue(attributes, 'lensKit') || '');
    if (/body only/i.test(kit)) return `${category.titleSuffix || category.label} Body`;
  }
  if (category.key === 'apple-iphone' || category.key === 'android-phone') {
    const unlocked = String(getAttributeValue(attributes, 'unlockedStatus') || '');
    if (/^yes$/i.test(unlocked)) return 'Unlocked';
    return '';
  }
  return category.titleSuffix || '';
}
