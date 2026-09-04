import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/taxCalc';
import { SHOPIFY_STATUS_COLORS, SHOPIFY_STATUS_LABELS } from '@/lib/shopify/constants';
import type { InventoryItem } from '@/types';
import type { ShopifyListing, ShopifyListingStatus } from '@/types/shopify';

export default function ShopifyListingTable({
  listings,
  inventoryById,
  onEdit,
  onViewInventory,
  onRetry,
  publishingListingId,
}: {
  listings: ShopifyListing[];
  inventoryById: Map<string, InventoryItem>;
  onEdit: (listing: ShopifyListing) => void;
  onViewInventory: (inventoryItemId: string) => void;
  onRetry?: (listing: ShopifyListing) => void;
  publishingListingId?: string | null;
}) {
  if (listings.length === 0) {
    return <p className="text-[12px] text-muted-foreground py-8 text-center">No listings in this view.</p>;
  }

  return (
    <div className="rounded-lg border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Photo</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Device Code</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>Shopify</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listings.map((listing) => {
            const item = inventoryById.get(listing.inventoryItemId);
            const status = listing.status as ShopifyListingStatus;
            const busy = publishingListingId === listing.id || listing.status === 'publishing';
            const shopifyHref = listing.shopifyAdminUrl || listing.shopifyUrl;
            return (
              <TableRow key={listing.id}>
                <TableCell>
                  {listing.photos[0] ? (
                    <img src={listing.photos[0]} alt="" className="size-10 rounded object-cover border" />
                  ) : (
                    <div className="size-10 rounded bg-muted" />
                  )}
                </TableCell>
                <TableCell className="text-[12px] font-medium max-w-[280px]">
                  <div className="truncate">{listing.title || 'Untitled draft'}</div>
                  {listing.status === 'error' && listing.lastError && (
                    <p className="text-[10px] text-destructive truncate mt-0.5">{listing.lastError}</p>
                  )}
                  {listing.status === 'active' && listing.shopifyProductId && (
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{listing.shopifyProductId}</p>
                  )}
                </TableCell>
                <TableCell className="font-mono text-[11px]">{item?.deviceCode || listing.sku || '—'}</TableCell>
                <TableCell>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${SHOPIFY_STATUS_COLORS[status]}`}>
                    {busy ? 'Publishing' : SHOPIFY_STATUS_LABELS[status]}
                  </span>
                </TableCell>
                <TableCell className="text-[11px]">{formatCurrency(listing.price)}</TableCell>
                <TableCell className="text-[11px]">{listing.quantity}</TableCell>
                <TableCell className="text-[11px]">{formatDate(listing.publishedAt || listing.updatedAt)}</TableCell>
                <TableCell className="text-[11px]">
                  {shopifyHref ? (
                    <a href={shopifyHref} target="_blank" rel="noreferrer" className="text-primary underline">
                      Open Shopify
                    </a>
                  ) : '—'}
                </TableCell>
                <TableCell className="space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onEdit(listing)}>
                    {listing.status === 'draft' || listing.status === 'error' ? 'Continue Draft' : listing.status === 'active' ? 'View Details' : 'Edit'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => onViewInventory(listing.inventoryItemId)}>
                    View Inventory
                  </Button>
                  {listing.status === 'ready' && onRetry && (
                    <Button size="sm" className="h-7 text-[10px]" disabled={busy} onClick={() => onRetry(listing)}>
                      Publish to Shopify
                    </Button>
                  )}
                  {listing.status === 'error' && onRetry && (
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" disabled={busy} onClick={() => onRetry(listing)}>
                      Retry Publish
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-[10px]" disabled title="End Listing will be added in a later phase.">
                    End Listing
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
