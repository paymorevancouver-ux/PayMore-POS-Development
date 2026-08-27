import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DeviceIntakeFields from '@/components/features/DeviceIntakeFields';
import DevicePhotoCapture from '@/components/features/DevicePhotoCapture';
import { DEVICE_CATEGORIES, getDeviceCategory } from '@/lib/deviceCategories';
import { emptySpecifications, generateListingTitle } from '@/lib/deviceSpecs';
import type { DeviceSpecifications, InventoryItem, PurchaseItem } from '@/types';

interface InventorySpecsEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  purchaseItem?: PurchaseItem;
  onSave: (updates: {
    specifications: DeviceSpecifications;
    listingTitle: string;
    photos?: string[];
  }) => void;
}

export default function InventorySpecsEditor({ open, onOpenChange, item, purchaseItem, onSave }: InventorySpecsEditorProps) {
  const [specs, setSpecs] = useState<DeviceSpecifications>({});
  const [listingTitle, setListingTitle] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !item) return;
    const next = item.specifications && Object.keys(item.specifications).length > 0
      ? item.specifications
      : emptySpecifications(getDeviceCategory(item.category)?.id);
    setSpecs(next);
    setListingTitle(item.listingTitle || generateListingTitle({
      category: item.category,
      brand: item.brand,
      model: item.model,
      specifications: next,
    }));
    setPhotos(purchaseItem?.photos || []);
  }, [open, item, purchaseItem]);

  if (!item) return null;
  const category = getDeviceCategory(item.category) || DEVICE_CATEGORIES.find((c) => c.label === 'Other Electronics')!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1000px] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle>Edit Specifications — {item.brand} {item.model}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <Label className="text-[11px] font-medium">Listing Title</Label>
            <Input value={listingTitle} onChange={(e) => setListingTitle(e.target.value)} className="mt-1 h-9 text-[12px]" />
          </div>
          <DeviceIntakeFields category={category} specs={specs} onChange={setSpecs} />
          {purchaseItem && (
            <div className="rounded-lg border p-3">
              <DevicePhotoCapture photos={photos} onChange={setPhotos} />
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex gap-2">
          <Button className="flex-1 h-9" onClick={() => onSave({
            specifications: specs,
            listingTitle,
            photos: purchaseItem ? photos : undefined,
          })}>
            Save Specifications
          </Button>
          <Button variant="outline" className="h-9" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
