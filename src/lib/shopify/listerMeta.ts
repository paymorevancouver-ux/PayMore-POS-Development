import type { ShopifyListing } from '@/types/shopify';

export type ShopifyDescriptionMode = 'generated' | 'manual';

export interface ShopifyListerMeta {
  extraTitleText: string;
  cosmeticConditionKey: string;
  cosmeticConditionNotes: string;
  functionalityConditionKey: string;
  functionalityNotes: string;
  descriptionMode: ShopifyDescriptionMode;
  includeNotListedWarning: boolean;
  originCountry: string;
  publicNotes: string;
  titleMode: ShopifyDescriptionMode;
}

const EMPTY: ShopifyListerMeta = {
  extraTitleText: '',
  cosmeticConditionKey: '',
  cosmeticConditionNotes: '',
  functionalityConditionKey: '',
  functionalityNotes: '',
  descriptionMode: 'generated',
  includeNotListedWarning: true,
  originCountry: '',
  publicNotes: '',
  titleMode: 'generated',
};

export function getListerMeta(listing: Partial<ShopifyListing> | ShopifyListing): ShopifyListerMeta {
  const stored = listing.attributes?.__lister;
  const fromAttr = stored && typeof stored === 'object' ? stored as Partial<ShopifyListerMeta> : {};
  return {
    extraTitleText: listing.extraTitleText ?? fromAttr.extraTitleText ?? '',
    cosmeticConditionKey: listing.cosmeticConditionKey ?? fromAttr.cosmeticConditionKey ?? '',
    cosmeticConditionNotes: listing.cosmeticConditionNotes ?? fromAttr.cosmeticConditionNotes ?? '',
    functionalityConditionKey: listing.functionalityConditionKey ?? fromAttr.functionalityConditionKey ?? '',
    functionalityNotes: listing.functionalityNotes ?? fromAttr.functionalityNotes ?? '',
    descriptionMode: listing.descriptionMode ?? fromAttr.descriptionMode ?? 'generated',
    includeNotListedWarning: listing.includeNotListedWarning ?? fromAttr.includeNotListedWarning ?? true,
    originCountry: listing.originCountry ?? fromAttr.originCountry ?? '',
    publicNotes: listing.publicNotes ?? fromAttr.publicNotes ?? '',
    titleMode: listing.titleMode ?? fromAttr.titleMode ?? 'generated',
  };
}

export function withListerMeta(listing: ShopifyListing, patch: Partial<ShopifyListerMeta>): ShopifyListing {
  const nextMeta = { ...getListerMeta(listing), ...patch };
  const attributes = { ...(listing.attributes || {}) };
  attributes.__lister = nextMeta;
  return {
    ...listing,
    ...nextMeta,
    attributes,
  };
}

export function emptyListerMeta(): ShopifyListerMeta {
  return { ...EMPTY };
}
