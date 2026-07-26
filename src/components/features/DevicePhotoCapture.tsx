import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Plus, ImageIcon } from 'lucide-react';

interface DevicePhotoCaptureProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  maxPhotos?: number;
}

function compressImage(file: File, maxWidth = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;

        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));

        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function DevicePhotoCapture({ photos, onChange, maxPhotos = 5 }: DevicePhotoCaptureProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const remaining = maxPhotos - photos.length;
    const toProcess = Array.from(files).slice(0, remaining);

    const newPhotos: string[] = [];
    for (const file of toProcess) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const compressed = await compressImage(file);
        newPhotos.push(compressed);
      } catch (err) {
        console.error('Failed to process image:', err);
      }
    }

    if (newPhotos.length > 0) {
      onChange([...photos, ...newPhotos]);
    }
  };

  const handleRemove = (idx: number) => {
    onChange(photos.filter((_, i) => i !== idx));
  };

  const canAdd = photos.length < maxPhotos;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <ImageIcon className="size-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium">Device Photos</span>
          <span className="text-[9px] text-muted-foreground">({photos.length}/{maxPhotos})</span>
        </div>
        {canAdd && (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" className="h-6 text-[9px] px-2"
              onClick={() => fileRef.current?.click()}>
              <Plus className="size-2.5 mr-0.5" />Browse
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-6 text-[9px] px-2"
              onClick={() => cameraRef.current?.click()}>
              <Camera className="size-2.5 mr-0.5" />Camera
            </Button>
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Photo grid */}
      {photos.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {photos.map((photo, idx) => (
            <div key={idx} className="relative group size-20 rounded-lg overflow-hidden border border-border bg-secondary">
              <img src={photo} alt={`Device photo ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="absolute top-0.5 right-0.5 size-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X className="size-3 text-white" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[8px] text-center py-0.5">
                {idx + 1}
              </div>
            </div>
          ))}
          {canAdd && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="size-20 rounded-lg border-2 border-dashed border-border hover:border-primary/40 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              <Plus className="size-5" />
              <span className="text-[8px] mt-0.5">Add</span>
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full py-4 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:border-primary/30 hover:text-primary/70 transition-colors cursor-pointer"
        >
          <Camera className="size-6 mb-1" />
          <span className="text-[11px]">Click to add device photos</span>
          <span className="text-[9px]">or use camera to capture</span>
        </button>
      )}
    </div>
  );
}
