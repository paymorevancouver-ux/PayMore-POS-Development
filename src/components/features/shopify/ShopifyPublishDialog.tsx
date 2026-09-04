import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/lib/taxCalc';
import type { ShopifyListing } from '@/types/shopify';

export default function ShopifyPublishDialog({
  open,
  listing,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  listing: ShopifyListing | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  if (!listing) return null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish to Shopify?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-[13px] text-foreground">
              <p>This will create a real Shopify product.</p>
              <p><span className="text-muted-foreground">Product:</span> {listing.title || 'Untitled'}</p>
              <p><span className="text-muted-foreground">Price:</span> {formatCurrency(listing.price)}</p>
              <p><span className="text-muted-foreground">Quantity:</span> {listing.quantity}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Publish Product</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
