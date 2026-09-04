import {
  getSpecCategory,
  isPublicField,
  type SpecCategoryDefinition,
} from '@/config/productSpecifications';
import { formatFieldValue, getAttributeValue, isUsablePublicValue } from '@/lib/shopify/attributes';
import type { ShopifyAccessory, ShopifyLens, ShopifyTestResult } from '@/types/shopify';

export interface DescriptionGeneratorInput {
  categoryKey?: string;
  categoryLabel?: string;
  brand: string;
  model: string;
  condition?: string;
  attributes?: Record<string, unknown>;
  accessories?: ShopifyAccessory[];
  testingResults?: Record<string, ShopifyTestResult>;
  publicNotes?: string;
}

const TEST_LABELS: Record<ShopifyTestResult, string> = {
  pass: 'Pass',
  fail: 'Fail',
  'not-tested': 'Not Tested',
  'not-applicable': 'Not Applicable',
};

function heading(title: string): string {
  return `${title}\n${'─'.repeat(title.length)}`;
}

function bullet(label: string, value: string): string {
  return `• ${label}: ${value}`;
}

export function generateShopifyDescription(input: DescriptionGeneratorInput): string {
  const category = getSpecCategory(input.categoryKey || input.categoryLabel || '', input.brand);
  const attributes = input.attributes || {};
  const brand = String(getAttributeValue(attributes, 'brand') || input.brand || '').trim();
  const model = String(getAttributeValue(attributes, 'model') || input.model || '').trim();
  const sections: string[] = [];

  const overview = [
    heading('Product Overview'),
    [brand, model, category.label].filter(Boolean).join(' '),
  ];
  sections.push(overview.filter(Boolean).join('\n'));

  const conditionLines = publicConditionLines(category, attributes, input.condition);
  if (conditionLines.length) {
    sections.push([heading('Condition'), ...conditionLines].join('\n'));
  }

  const specLines = publicSpecificationLines(category, attributes);
  if (specLines.length) {
    sections.push([heading('Specifications'), ...specLines].join('\n'));
  }

  const testLines = publicTestingLines(category, input.testingResults || {});
  if (testLines.length) {
    sections.push([heading('Functional Testing'), ...testLines].join('\n'));
  }

  const accessoryLines = includedAccessoryLines(input.accessories || []);
  const lenses = Array.isArray(attributes.lenses) ? (attributes.lenses as ShopifyLens[]) : [];
  const lensLines = lenses
    .filter((lens) => isUsablePublicValue(lens.brand) || isUsablePublicValue(lens.model))
    .map((lens) => {
      const parts = [lens.brand, lens.model, lens.focalLength, lens.maxAperture, lens.condition].filter((p) => isUsablePublicValue(p));
      return `• Lens: ${parts.join(' ')}`;
    });
  if (accessoryLines.length || lensLines.length) {
    sections.push([heading('Included Accessories'), ...accessoryLines, ...lensLines].join('\n'));
  }

  const notes = (input.publicNotes || '').trim();
  if (notes) {
    sections.push([heading('Additional Notes'), notes].join('\n'));
  }

  return sections.join('\n\n').trim();
}

function publicConditionLines(
  category: SpecCategoryDefinition,
  attributes: Record<string, unknown>,
  listingCondition?: string,
): string[] {
  const lines: string[] = [];
  if (isUsablePublicValue(listingCondition)) {
    lines.push(bullet('Listed Condition', String(listingCondition)));
  }
  for (const field of category.fields.filter((f) => f.section === 'condition' && isPublicField(f))) {
    const value = formatFieldValue(field, getAttributeValue(attributes, field.key));
    if (isUsablePublicValue(value)) lines.push(bullet(field.label, value));
  }
  return lines;
}

function publicSpecificationLines(
  category: SpecCategoryDefinition,
  attributes: Record<string, unknown>,
): string[] {
  const skip = new Set(['brand', 'model']);
  return category.fields
    .filter((field) => (
      field.includeInDescription !== false
      && isPublicField(field)
      && field.section !== 'condition'
      && !skip.has(field.key)
    ))
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .flatMap((field) => {
      const value = formatFieldValue(field, getAttributeValue(attributes, field.key));
      if (!isUsablePublicValue(value)) return [];
      return [bullet(field.label, value)];
    });
}

function publicTestingLines(
  category: SpecCategoryDefinition,
  results: Record<string, ShopifyTestResult>,
): string[] {
  return category.tests
    .filter((test) => test.publicVisibility !== 'internal_only')
    .flatMap((test) => {
      const result = results[test.id];
      if (!result || result === 'not-tested' || result === 'not-applicable') return [];
      return [bullet(test.label, TEST_LABELS[result])];
    });
}

function includedAccessoryLines(accessories: ShopifyAccessory[]): string[] {
  return accessories
    .filter((item) => item.included)
    .map((item) => {
      const qty = item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : '';
      return `• ${item.label}${qty}`;
    });
}

export function descriptionContainsInternalLeak(description: string): boolean {
  const lower = description.toLowerCase();
  return (
    lower.includes('imei')
    || lower.includes('serial number')
    || lower.includes('staff note')
    || lower.includes('employee note')
    || /\bcost\b/.test(lower)
  );
}
