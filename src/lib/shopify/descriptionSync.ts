import { generateShopifyDescriptionHtml } from '@/lib/shopify/descriptionHtml';
import { getListerMeta, withListerMeta } from '@/lib/shopify/listerMeta';
import type { ShopifyListing } from '@/types/shopify';

export function syncGeneratedDescription(listing: ShopifyListing): ShopifyListing {
  const meta = getListerMeta(listing);
  if (meta.descriptionMode === 'manual') return listing;
  const description = generateShopifyDescriptionHtml({
    ...listing,
    ...meta,
  });
  return { ...listing, description };
}

export function markDescriptionManual(listing: ShopifyListing, description: string): ShopifyListing {
  return withListerMeta({ ...listing, description }, { descriptionMode: 'manual' });
}

export function regenerateDescription(listing: ShopifyListing): ShopifyListing {
  const next = withListerMeta(listing, { descriptionMode: 'generated' });
  return syncGeneratedDescription(next);
}
