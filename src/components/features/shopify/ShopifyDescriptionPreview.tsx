import { generateShopifyDescriptionHtml } from '@/lib/shopify/descriptionHtml';
import { getListerMeta } from '@/lib/shopify/listerMeta';
import type { ShopifyListing } from '@/types/shopify';

export default function ShopifyDescriptionPreview({ listing }: { listing: ShopifyListing }) {
  const meta = getListerMeta(listing);
  const html = listing.descriptionMode === 'manual' || meta.descriptionMode === 'manual'
    ? listing.description
    : generateShopifyDescriptionHtml({ ...listing, ...meta });

  return (
    <div className="rounded-lg border bg-white shadow-none h-full">
      <div className="px-4 py-3 border-b">
        <p className="text-[12px] font-semibold">Shopify Description Preview</p>
        <p className="text-[10px] text-muted-foreground">This is the HTML Shopify will receive.</p>
      </div>
      <div className="p-4 overflow-auto max-h-[calc(100vh-220px)] xl:sticky xl:top-0">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
