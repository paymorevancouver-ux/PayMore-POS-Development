import { getSpecCategory, isPublicField } from '@/config/productSpecifications';
import { getAttributeValue, isUsablePublicValue } from '@/lib/shopify/attributes';

const TAG_KEYS = [
  'series',
  'macFamily',
  'consoleFamily',
  'chip',
  'cpu.family',
  'cpu.model',
  'gpu.model',
  'ram.total',
  'storage.primaryCapacity',
  'color',
  'cosmeticCondition',
  'unlockedStatus',
  'cameraType',
  'sensorSize',
  'display.size',
  'display.refreshRate',
];

export function generateShopifyTags(input: {
  categoryKey?: string;
  categoryLabel?: string;
  brand: string;
  model: string;
  condition?: string;
  attributes?: Record<string, unknown>;
}): string[] {
  const category = getSpecCategory(input.categoryKey || input.categoryLabel || '', input.brand);
  const attributes = input.attributes || {};
  const tags: string[] = [];

  const push = (value: unknown) => {
    const text = String(value || '').trim();
    if (!isUsablePublicValue(text)) return;
    if (tags.some((t) => t.toLowerCase() === text.toLowerCase())) return;
    tags.push(text);
  };

  push(category.productType);
  push(category.label);
  push(input.brand);
  push(input.model);
  push(input.condition);

  for (const key of TAG_KEYS) {
    const field = category.fields.find((f) => f.key === key);
    if (field && !isPublicField(field)) continue;
    push(getAttributeValue(attributes, key));
  }

  return tags.slice(0, 15);
}
