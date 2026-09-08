import { useState } from 'react';
import DevicePhotoCapture from '@/components/features/DevicePhotoCapture';
import ShopifyPhoneUploadDialog from '@/components/features/shopify/ShopifyPhoneUploadDialog';
import { MAX_SHOPIFY_PHOTOS } from '@/lib/shopify/constants';
import { listingPhotoSources, listingPhotoUrl, mergeCapturedPhotoUrls, reorderListingPhotos } from '@/lib/shopify/photos';
import type { ShopifyListing, ShopifyListingPhoto } from '@/types/shopify';
import { Button } from '@/components/ui/button';
import { QrCode } from 'lucide-react';

export default function ShopifyPhotoManager({
  listing,
  photos,
  storeId,
  employeeId,
  onChange,
}: {
  listing: ShopifyListing;
  photos: ShopifyListingPhoto[];
  storeId?: string;
  employeeId?: string | null;
  onChange: (photos: ShopifyListingPhoto[]) => void;
}) {
  const [phoneOpen, setPhoneOpen] = useState(false);
  const urls = listingPhotoSources(photos);
  const move = (from: number, to: number) => onChange(reorderListingPhotos(photos, from, to));

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Removing a photo here only removes it from this Shopify draft. Original POS photos are not deleted.
      </p>
      <DevicePhotoCapture
        photos={urls}
        onChange={(nextUrls) => onChange(mergeCapturedPhotoUrls(photos, nextUrls))}
        maxPhotos={MAX_SHOPIFY_PHOTOS}
        extraActions={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 text-[9px] px-2"
            onClick={() => setPhoneOpen(true)}
            disabled={!storeId || urls.length >= MAX_SHOPIFY_PHOTOS}
          >
            <QrCode className="size-2.5 mr-0.5" /> Upload by Phone
          </Button>
        )}
      />
      {photos.length > 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {photos.map((photo, idx) => (
            <div
              key={typeof photo === 'string' ? `${idx}-${photo.slice(0, 24)}` : photo.id}
              className="rounded-md border p-1.5 space-y-1"
              draggable
              onDragStart={(event) => event.dataTransfer.setData('text/plain', String(idx))}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                move(Number(event.dataTransfer.getData('text/plain')), idx);
              }}
            >
              <img src={listingPhotoUrl(photo)} alt={`Listing photo ${idx + 1}`} className="h-20 w-full object-cover rounded" />
              <div className="flex justify-between">
                <button type="button" className="text-[10px] text-muted-foreground" onClick={() => move(idx, idx - 1)} disabled={idx === 0}>Up</button>
                <button type="button" className="text-[10px] text-muted-foreground" onClick={() => move(idx, idx + 1)} disabled={idx === photos.length - 1}>Down</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {storeId && (
        <ShopifyPhoneUploadDialog
          open={phoneOpen}
          listing={listing}
          storeId={storeId}
          employeeId={employeeId}
          onOpenChange={setPhoneOpen}
          onPhotos={onChange}
        />
      )}
    </div>
  );
}
