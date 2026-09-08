import { X } from 'lucide-react';
import type { InventoryItem } from '@/types';
import type { ShopifyListing } from '@/types/shopify';

export default function ShopifyProductTabs({
  listings,
  inventoryById,
  activeId,
  onSelect,
  onClose,
}: {
  listings: ShopifyListing[];
  inventoryById: Map<string, InventoryItem>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  if (listings.length === 0) return null;
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {listings.map((listing) => {
        const item = inventoryById.get(listing.inventoryItemId);
        const active = listing.id === activeId;
        return (
          <div
            key={listing.id}
            className={`flex items-center gap-1 rounded-t-md border px-2 py-1.5 min-w-[160px] max-w-[240px] ${
              active ? 'bg-background border-b-background font-semibold' : 'bg-muted/50 text-muted-foreground'
            }`}
          >
            <button type="button" className="text-left text-[11px] truncate flex-1" onClick={() => onSelect(listing.id)}>
              <span className="block truncate">{listing.title || item?.model || 'Untitled'}</span>
              <span className="block font-mono text-[10px]">{item?.deviceCode || listing.sku}</span>
            </button>
            <button
              type="button"
              className="size-5 rounded hover:bg-secondary flex items-center justify-center"
              onClick={() => onClose(listing.id)}
              aria-label="Close tab"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
