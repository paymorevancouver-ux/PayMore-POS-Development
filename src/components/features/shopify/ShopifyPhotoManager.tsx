import DevicePhotoCapture from '@/components/features/DevicePhotoCapture';

export default function ShopifyPhotoManager({
  photos,
  onChange,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
}) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length) return;
    const next = [...photos];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Removing a photo here only removes it from this Shopify draft. Original POS photos are not deleted.
      </p>
      <DevicePhotoCapture photos={photos} onChange={onChange} maxPhotos={12} />
      {photos.length > 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {photos.map((src, idx) => (
            <div key={`${idx}-${src.slice(0, 24)}`} className="rounded-md border p-1.5 space-y-1">
              <img src={src} alt={`Listing photo ${idx + 1}`} className="h-20 w-full object-cover rounded" />
              <div className="flex justify-between">
                <button type="button" className="text-[10px] text-muted-foreground" onClick={() => move(idx, idx - 1)} disabled={idx === 0}>Up</button>
                <button type="button" className="text-[10px] text-muted-foreground" onClick={() => move(idx, idx + 1)} disabled={idx === photos.length - 1}>Down</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
