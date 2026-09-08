export const PHOTO_CONDITION_SENTENCE =
  'Please view our close-up photos, as these are photos of the actual item being offered for sale.';

export const INCLUDED_ITEMS_WARNING =
  'Please note, if it is not listed it is not included - such as power cables or other accessories.';

export const RECOMMENDED_SHOPIFY_TITLE_LENGTH = 70;

export type CosmeticConditionKey =
  | 'NEW_SEALED'
  | 'NEW_NO_SEAL'
  | 'FLAWLESS'
  | 'VERY_GOOD'
  | 'GOOD'
  | 'FAIR'
  | 'POOR'
  | 'BROKEN';

export type FunctionalityConditionKey =
  | 'NEW_SEALED'
  | 'NEW_NO_SEAL'
  | 'FULLY_FUNCTIONAL'
  | 'PARTIALLY_FUNCTIONAL'
  | 'UNTESTED'
  | 'BROKEN';

export interface ConditionPhraseOption<K extends string> {
  key: K;
  label: string;
  summary: string;
  phrase: string;
  used?: boolean;
}

export const COSMETIC_CONDITION_OPTIONS: ConditionPhraseOption<CosmeticConditionKey>[] = [
  {
    key: 'NEW_SEALED',
    label: 'New - Sealed',
    summary: 'Brand new, factory sealed packaging.',
    phrase: "This device is brand new and sealed in the manufacturer's original packaging.",
    used: false,
  },
  {
    key: 'NEW_NO_SEAL',
    label: 'New - No Seal',
    summary: 'Brand new in original packaging; seal opened or removed.',
    phrase: "This device is brand new in the manufacturer's original packaging. The original seal may have been opened or removed for inspection.",
    used: false,
  },
  {
    key: 'FLAWLESS',
    label: 'Flawless',
    summary: 'Exceptional cosmetics with little to no visible wear.',
    phrase: 'This item is in exceptional cosmetic condition with little to no visible signs of use.',
    used: true,
  },
  {
    key: 'VERY_GOOD',
    label: 'Very Good',
    summary: 'Used, like-new appearance with very few marks.',
    phrase: 'This item is used but remains in like-new, excellent condition. There are very few, if any, scratches or scuffs.',
    used: true,
  },
  {
    key: 'GOOD',
    label: 'Good',
    summary: 'Normal everyday wear such as light scratches or scuffs.',
    phrase: 'This item is used and in good cosmetic condition. There may be light scratches, scuffs, or normal signs of everyday use.',
    used: true,
  },
  {
    key: 'FAIR',
    label: 'Fair',
    summary: 'Noticeable scratches, scuffs, or regular-use marks.',
    phrase: 'This item is used and in fair cosmetic condition. There are noticeable scratches, scuffs, marks, or other signs of regular use.',
    used: true,
  },
  {
    key: 'POOR',
    label: 'Poor',
    summary: 'Heavy cosmetic wear. Review photos carefully.',
    phrase: 'This item shows significant cosmetic wear, which may include heavy scratches, scuffs, dents, cracks, discoloration, or other visible damage. Please review the photos carefully.',
    used: true,
  },
  {
    key: 'BROKEN',
    label: 'Broken',
    summary: 'Sold as-is with significant cosmetic damage.',
    phrase: 'This item is being sold as-is and may have significant cosmetic damage, missing parts, cracks, dents, or heavy wear.',
    used: true,
  },
];

export const FUNCTIONALITY_CONDITION_OPTIONS: ConditionPhraseOption<FunctionalityConditionKey>[] = [
  {
    key: 'NEW_SEALED',
    label: 'New - Sealed',
    summary: 'Sealed new item; expected to work to spec.',
    phrase: "This item is brand new and sealed in the manufacturer's original packaging. It should function according to the manufacturer's specifications.",
  },
  {
    key: 'NEW_NO_SEAL',
    label: 'New - No Seal',
    summary: 'New in box; seal opened only for inspection.',
    phrase: "This item is brand new in the manufacturer's original packaging. The seal was opened only for inspection or verification.",
  },
  {
    key: 'FULLY_FUNCTIONAL',
    label: 'Fully Functional',
    summary: 'Tested; applicable functions work as expected.',
    phrase: 'This item is fully functional and has been tested to ensure the applicable functions are working as expected.',
  },
  {
    key: 'PARTIALLY_FUNCTIONAL',
    label: 'Partially Functional',
    summary: 'Tested with one or more issues. Review notes.',
    phrase: 'This item has been tested and is partially functional. Please review the functionality notes below for details.',
  },
  {
    key: 'UNTESTED',
    label: 'Untested',
    summary: 'Not fully tested; sold as shown.',
    phrase: 'This item has not been fully tested. It is being sold based on the condition and information shown in this listing.',
  },
  {
    key: 'BROKEN',
    label: 'For Parts / Broken',
    summary: 'Not fully functional; sold as-is for parts or repair.',
    phrase: 'This item is not fully functional and is being sold as-is for repair or parts.',
  },
];

export const COMMON_INCLUDED_ITEMS: Array<{ id: string; label: string }> = [
  { id: 'device-only', label: 'Device Only' },
  { id: 'original-box', label: 'Original Box' },
  { id: 'charger', label: 'Charger' },
  { id: 'power-cable', label: 'Power Cable' },
  { id: 'ac-adapter', label: 'AC Adapter' },
  { id: 'usb-cable', label: 'USB Cable' },
  { id: 'hdmi-cable', label: 'HDMI Cable' },
  { id: 'controller', label: 'Controller' },
  { id: 'dock', label: 'Dock' },
  { id: 'remote', label: 'Remote' },
  { id: 'manual', label: 'Manual / Paperwork' },
  { id: 'original-accessories', label: 'Original Accessories' },
  { id: 'case', label: 'Case' },
  { id: 'bag', label: 'Bag' },
];
