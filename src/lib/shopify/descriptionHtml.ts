import {
  getSpecCategory,
  isInternalOnlyField,
  isPublicField,
  type SpecCategoryDefinition,
} from '@/config/productSpecifications';
import { INCLUDED_ITEMS_WARNING } from '@/config/shopifyConditionPhrases';
import { formatFieldValue, getAttributeValue, isUsablePublicValue } from '@/lib/shopify/attributes';
import { buildCosmeticPhrase, buildFunctionalityPhrase } from '@/lib/shopify/conditionPhrases';
import { isInternalAttributeKey } from '@/lib/shopify/visibility';
import type { ShopifyAccessory, ShopifyListing, ShopifyTestResult } from '@/types/shopify';

const SECTION_GREEN = '#1f7a1f';
const WARNING_RED = '#c41e3a';
const BORDER = '#cfcfcf';
const TEXT = '#222222';

export interface DescriptionHtmlInput {
  title: string;
  categoryLabel?: string;
  brand?: string;
  model?: string;
  attributes?: Record<string, unknown>;
  accessories?: ShopifyAccessory[];
  includeNotListedWarning?: boolean;
  cosmeticConditionKey?: string | null;
  cosmeticConditionNotes?: string;
  functionalityConditionKey?: string | null;
  functionalityNotes?: string;
  publicNotes?: string;
  originCountry?: string;
  testingResults?: Record<string, ShopifyTestResult>;
}

export interface SpecTableRow {
  label: string;
  value: string;
}

export function getPublicSpecificationRows(
  category: SpecCategoryDefinition,
  attributes: Record<string, unknown>,
  extras: Array<{ label: string; value?: string | null }> = [],
): SpecTableRow[] {
  const rows: SpecTableRow[] = extras
    .filter((row) => isUsablePublicValue(row.value))
    .map((row) => ({ label: row.label, value: String(row.value) }));

  for (const field of [...category.fields].sort((a, b) => a.displayOrder - b.displayOrder)) {
    if (field.includeInDescription === false) continue;
    if (!isPublicField(field) || isInternalOnlyField(field)) continue;
    if (isInternalAttributeKey(field.key)) continue;
    if (field.section === 'condition') continue;
    const value = formatFieldValue(field, getAttributeValue(attributes, field.key));
    if (!isUsablePublicValue(value)) continue;
    if (rows.some((row) => row.label === field.label && row.value === value)) continue;
    rows.push({ label: field.label, value });
  }
  return rows;
}

function publicTestingRows(
  category: SpecCategoryDefinition,
  results: Record<string, ShopifyTestResult>,
): string[] {
  return category.tests
    .filter((test) => test.publicVisibility !== 'internal_only')
    .map((test) => {
      const value = results[test.id];
      if (value !== 'pass' && value !== 'fail') return '';
      return `${test.label}: ${value === 'pass' ? 'Pass' : 'Fail'}`;
    })
    .filter(Boolean);
}

export function includedItemLabels(accessories: ShopifyAccessory[] = []): string[] {
  return accessories
    .filter((item) => item.included)
    .map((item) => {
      const qty = item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : '';
      return `${item.label}${qty}`;
    });
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sectionTitle(label: string): string {
  return `<h2 style="color:${SECTION_GREEN};font-size:16px;font-weight:700;margin:18px 0 8px;">${escapeHtml(label)}</h2>`;
}

function paragraph(text: string, style = `color:${TEXT};font-size:14px;line-height:1.5;margin:0 0 8px;`): string {
  return `<p style="${style}">${escapeHtml(text)}</p>`;
}

export function generateShopifyDescriptionHtml(input: DescriptionHtmlInput | ShopifyListing): string {
  const listing = input as ShopifyListing & DescriptionHtmlInput;
  const attributes = listing.attributes || {};
  const category = getSpecCategory(
    String(attributes.categoryId || listing.shopifyProductType || listing.categoryLabel || ''),
    String(listing.shopifyVendor || listing.brand || ''),
  );
  const title = listing.title || [listing.brand, listing.model].filter(Boolean).join(' ');
  const included = includedItemLabels(listing.accessories || []);
  const specRows = getPublicSpecificationRows(category, attributes, [
    { label: 'Collection', value: category.label },
    { label: 'Brand', value: String(getAttributeValue(attributes, 'brand') || listing.shopifyVendor || listing.brand || '') },
    { label: 'Model', value: String(getAttributeValue(attributes, 'model') || listing.model || '') },
    { label: 'Country of Origin', value: listing.originCountry },
  ]);
  const cosmetic = buildCosmeticPhrase(listing.cosmeticConditionKey, listing.cosmeticConditionNotes);
  const functionality = buildFunctionalityPhrase(listing.functionalityConditionKey, listing.functionalityNotes);
  const publicNotes = (listing.publicNotes || '').trim();
  const includeWarning = listing.includeNotListedWarning !== false;

  const parts: string[] = [];
  parts.push(`<div style="font-family:Arial,Helvetica,sans-serif;color:${TEXT};">`);
  if (title.trim()) {
    parts.push(`<h1 style="text-align:center;font-size:22px;font-weight:700;margin:0 0 16px;color:${TEXT};">${escapeHtml(title.trim())}</h1>`);
  }
  parts.push(`<hr style="border:none;border-top:1px solid ${BORDER};margin:0 0 16px;" />`);

  parts.push(sectionTitle('Items included in this sale:'));
  if (included.length) {
    parts.push(`<ul style="margin:0 0 8px;padding-left:20px;">${included.map((item) => `<li style="margin:0 0 4px;">${escapeHtml(item)}</li>`).join('')}</ul>`);
  } else {
    parts.push(paragraph('See listing details.'));
  }
  if (includeWarning) {
    parts.push(paragraph(`*${INCLUDED_ITEMS_WARNING}`, `color:${WARNING_RED};font-size:13px;font-style:italic;margin:8px 0 12px;`));
  }

  if (specRows.length) {
    parts.push(sectionTitle('Specifications:'));
    parts.push(
      `<table style="width:100%;border-collapse:collapse;margin:0 0 12px;"><tbody>${specRows.map((row) => (
        `<tr><td style="width:40%;border:1px solid ${BORDER};padding:8px;font-weight:700;vertical-align:top;">${escapeHtml(row.label)}</td><td style="border:1px solid ${BORDER};padding:8px;vertical-align:top;">${escapeHtml(row.value)}</td></tr>`
      )).join('')}</tbody></table>`,
    );
  }

  if (cosmetic) {
    parts.push(sectionTitle('Cosmetic Condition:'));
    parts.push(paragraph(cosmetic));
  }
  if (functionality) {
    parts.push(sectionTitle('Functionality:'));
    parts.push(paragraph(functionality));
    const testRows = publicTestingRows(category, listing.testingResults || {});
    if (testRows.length) {
      parts.push(`<ul style="margin:8px 0 12px;padding-left:20px;">${testRows.map((row) => `<li style="margin:0 0 4px;">${escapeHtml(row)}</li>`).join('')}</ul>`);
    }
  }
  if (publicNotes) {
    parts.push(sectionTitle('Additional Notes:'));
    parts.push(paragraph(publicNotes));
  }

  parts.push('</div>');
  return parts.join('');
}

export function isGeneratedShopifyHtml(description: string): boolean {
  return /<(div|h1|h2|table|ul)\b/i.test(description || '');
}
