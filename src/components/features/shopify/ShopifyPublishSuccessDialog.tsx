import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/taxCalc';
import type { ShopifyListing } from '@/types/shopify';

export default function ShopifyPublishSuccessDialog({
  open,
  listing,
  barcode,
  onOpenChange,
  onOpenShopify,
  onPrintLabel,
  onDone,
}: {
  open: boolean;
  listing: ShopifyListing | null;
  barcode?: string;
  onOpenChange: (open: boolean) => void;
  onOpenShopify: () => void;
  onPrintLabel: () => void;
  onDone: () => void;
}) {
  if (!listing) return null;
  const code = barcode || listing.barcode || '';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Successfully Listed on Shopify</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-[13px]">
          <p><span className="text-muted-foreground">Product:</span> {listing.title}</p>
          <p><span className="text-muted-foreground">SKU:</span> <span className="font-mono">{listing.sku}</span></p>
          <p><span className="text-muted-foreground">Barcode:</span> <span className="font-mono">{code || '—'}</span></p>
          <p><span className="text-muted-foreground">Price:</span> {formatCurrency(listing.price)}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onOpenShopify}>Open Shopify</Button>
          <Button variant="outline" onClick={onPrintLabel} disabled={!code}>Print Label</Button>
          <Button onClick={onDone}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
