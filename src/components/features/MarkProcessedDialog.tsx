import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { InventoryItem } from '@/types';

export default function MarkProcessedDialog({
  open,
  item,
  success,
  onOpenChange,
  onConfirm,
  onGenerateLabel,
  onDone,
}: {
  open: boolean;
  item: InventoryItem | null;
  success?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onGenerateLabel: () => void;
  onDone: () => void;
}) {
  if (!item) return null;
  const title = `${item.brand} ${item.model}`.trim() || item.listingTitle || item.deviceCode;
  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Item Processed Successfully</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-[13px]">
            <p><span className="text-muted-foreground">Product:</span> {title}</p>
            <p><span className="text-muted-foreground">Device Code:</span> <span className="font-mono">{item.deviceCode}</span></p>
            <p><span className="text-muted-foreground">Status:</span> Listed</p>
            <p><span className="text-muted-foreground">Listing Method:</span> Processed Manually</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onGenerateLabel}>Generate Label</Button>
            <Button onClick={onDone}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark this item as processed?</DialogTitle>
        </DialogHeader>
        <p className="text-[13px]">This will move the item from Non-Listed to Listed without publishing it to Shopify.</p>
        <div className="space-y-1 text-[13px]">
          <p><span className="text-muted-foreground">Product:</span> {title}</p>
          <p><span className="text-muted-foreground">Device Code:</span> <span className="font-mono">{item.deviceCode}</span></p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm}>Mark as Processed</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
