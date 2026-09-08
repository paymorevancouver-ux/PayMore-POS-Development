import { describe, expect, it } from 'vitest';
import { PHOTO_CONDITION_SENTENCE } from '@/config/shopifyConditionPhrases';
import {
  buildCosmeticPhrase,
  buildFunctionalityPhrase,
  mapPosConditionToCosmetic,
} from './conditionPhrases';
import { generateShopifyDescriptionHtml, getPublicSpecificationRows, includedItemLabels } from './descriptionHtml';
import { markDescriptionManual, regenerateDescription, syncGeneratedDescription } from './descriptionSync';
import { applyDraftUpdates } from './prefill';
import { validateReadyListing } from './validation';
import { MAX_SHOPIFY_SELECTION } from './constants';
import { toggleInventorySelection } from './selection';
import { getSpecCategory } from '@/config/productSpecifications';
import type { ShopifyListing } from '@/types/shopify';

function listing(partial: Partial<ShopifyListing> = {}): ShopifyListing {
  return {
    id: 'SFL-1',
    storeId: 'STR-001',
    inventoryItemId: 'INV-1',
    status: 'draft',
    title: 'ASUS ROG Zephyrus G14',
    description: '',
    price: 999,
    compareAtPrice: null,
    quantity: 1,
    condition: 'Very Good',
    shopifyVendor: 'ASUS',
    shopifyProductType: 'Windows Laptop',
    sku: 'BC05-000623',
    barcode: '',
    tags: ['ASUS'],
    photos: [],
    attributes: {
      categoryId: 'windows-laptop',
      brand: 'ASUS',
      model: 'ROG Zephyrus G14',
      'cpu.model': 'Ryzen 9',
      ram: { total: '16GB' },
      imei1: '356789012345678',
      serialNumber: 'SN-HIDDEN',
    },
    accessories: [
      { id: 'device', label: 'Windows Laptop', included: true },
      { id: 'original-charger', label: 'Original Charger', included: true },
    ],
    testingResults: {},
    staffNotes: 'Do not publish',
    extraTitleText: '',
    cosmeticConditionKey: 'VERY_GOOD',
    cosmeticConditionNotes: '',
    functionalityConditionKey: 'FULLY_FUNCTIONAL',
    functionalityNotes: '',
    descriptionMode: 'generated',
    includeNotListedWarning: true,
    originCountry: '',
    publicNotes: '',
    titleMode: 'generated',
    shopifyCategoryId: null,
    shopifyCategoryName: null,
    shopifyCategoryFullName: null,
    shopifyCategoryConfirmed: false,
    shopifyProductId: null,
    shopifyVariantId: null,
    shopifyInventoryItemId: null,
    shopifyHandle: null,
    shopifyUrl: null,
    lastError: null,
    createdByEmployeeId: 'EMP-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    publishedAt: null,
    lastSyncedAt: null,
    endedAt: null,
    ...partial,
  };
}

describe('cosmetic and functionality phrases', () => {
  it('maps cosmetic keys to the configured phrase', () => {
    expect(buildCosmeticPhrase('FLAWLESS', '', false)).toBe(
      'This item is in exceptional cosmetic condition with little to no visible signs of use.',
    );
    expect(buildCosmeticPhrase('VERY_GOOD', '', false)).toContain('like-new, excellent condition');
  });

  it('maps functionality keys to the configured phrase', () => {
    expect(buildFunctionalityPhrase('FULLY_FUNCTIONAL')).toContain('fully functional');
    expect(buildFunctionalityPhrase('BROKEN')).toContain('repair or parts');
  });

  it('appends the photo sentence for used cosmetic conditions', () => {
    const phrase = buildCosmeticPhrase('GOOD');
    expect(phrase).toContain(PHOTO_CONDITION_SENTENCE);
    expect(buildCosmeticPhrase('NEW_SEALED')).not.toContain(PHOTO_CONDITION_SENTENCE);
  });

  it('maps POS inventory conditions', () => {
    expect(mapPosConditionToCosmetic('excellent')).toBe('VERY_GOOD');
    expect(mapPosConditionToCosmetic('for-parts')).toBe('BROKEN');
    expect(mapPosConditionToCosmetic('new')).toBe('NEW_SEALED');
  });
});

describe('HTML description generation', () => {
  it('renders included items and the not-listed warning', () => {
    const html = generateShopifyDescriptionHtml(listing());
    expect(html).toContain('Items included in this sale:');
    expect(html).toContain('Windows Laptop');
    expect(html).toContain('Original Charger');
    expect(html).toContain('if it is not listed it is not included');
  });

  it('excludes empty specification rows and internal IMEI/serial', () => {
    const category = getSpecCategory('windows-laptop', 'ASUS');
    const rows = getPublicSpecificationRows(category, listing().attributes, [{ label: 'Empty', value: '' }]);
    expect(rows.some((row) => row.label === 'Empty')).toBe(false);
    expect(rows.some((row) => /imei/i.test(row.label) || /serial/i.test(row.label))).toBe(false);
    const html = generateShopifyDescriptionHtml(listing());
    expect(html).not.toContain('356789012345678');
    expect(html).not.toContain('SN-HIDDEN');
    expect(html).not.toContain('Do not publish');
    expect(html).toContain('<table');
    expect(html).toContain('16GB');
  });

  it('lists only included accessories', () => {
    expect(includedItemLabels([
      { id: 'a', label: 'Laptop', included: true },
      { id: 'b', label: 'Box', included: false },
      { id: 'c', label: '2 x 4TB HDD', included: true, custom: true },
    ])).toEqual(['Laptop', '2 x 4TB HDD']);
  });

  it('appends listing-specific notes after the standard phrases', () => {
    const html = generateShopifyDescriptionHtml(listing({
      cosmeticConditionNotes: 'Small scratch near the rear USB port.',
      functionalityNotes: 'Battery holds charge for about 3 hours.',
    }));
    expect(html).toContain('like-new, excellent condition');
    expect(html).toContain('Small scratch near the rear USB port.');
    expect(html).toContain('fully functional');
    expect(html).toContain('Battery holds charge for about 3 hours.');
  });
});

describe('manual description override', () => {
  it('does not overwrite a manual description', () => {
    const manual = markDescriptionManual(listing(), '<p>Custom HTML</p>');
    const next = syncGeneratedDescription({ ...manual, price: 50, accessories: [] });
    expect(next.description).toBe('<p>Custom HTML</p>');
    expect(next.descriptionMode).toBe('manual');
  });

  it('regenerates after confirmation', () => {
    const manual = markDescriptionManual(listing(), '<p>Custom HTML</p>');
    const next = regenerateDescription(manual);
    expect(next.descriptionMode).toBe('generated');
    expect(next.description).toContain('Items included in this sale:');
    expect(next.description).not.toContain('Custom HTML');
  });
});

describe('multi-tab drafts', () => {
  it('caps inventory selection at 10', () => {
    let selected: string[] = [];
    for (let i = 1; i <= 12; i++) {
      selected = toggleInventorySelection(selected, `INV-${i}`).selectedIds;
    }
    expect(selected).toHaveLength(MAX_SHOPIFY_SELECTION);
  });

  it('keeps each listing draft independent when switching tabs', () => {
    const first = applyDraftUpdates(listing({ id: 'SFL-1' }), { extraTitleText: 'w/ Charger', price: 111 });
    const second = applyDraftUpdates(listing({ id: 'SFL-2', title: 'QNAP TS-469 PRO' }), { price: 222, accessories: [{ id: 'device', label: 'NAS', included: true }] });
    expect(first.id).toBe('SFL-1');
    expect(second.id).toBe('SFL-2');
    expect(first.extraTitleText).toBe('w/ Charger');
    expect(second.extraTitleText).toBe('');
    expect(first.price).toBe(111);
    expect(second.price).toBe(222);
    expect(second.description).toContain('QNAP TS-469 PRO');
    expect(first.description).not.toContain('QNAP TS-469 PRO');
  });

  it('requires cosmetic and functionality conditions before Ready', () => {
    const result = validateReadyListing(listing({
      cosmeticConditionKey: '',
      functionalityConditionKey: '',
      shopifyProductType: 'Windows Laptop',
      shopifyVendor: 'ASUS',
    }), 'Windows Laptop');
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.message)).toEqual(expect.arrayContaining([
      'Cosmetic Condition is required.',
      'Functionality Condition is required.',
    ]));
  });
});
