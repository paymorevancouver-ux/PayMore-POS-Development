import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { compressImageFile } from '@/lib/shopify/imageCompress';
import { MAX_SHOPIFY_PHOTOS, SHOPIFY_PHOTO_MAX_EDGE_PX } from '@/lib/shopify/constants';
import { describeEdgeFunctionError } from '@/lib/shopify/functionErrors';
import { Camera, ImageIcon, Check } from 'lucide-react';

export default function ShopifyPhotoUploadPage() {
  const { token } = useParams<{ token: string }>();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [sku, setSku] = useState('');
  const [photos, setPhotos] = useState<Array<{ id?: string; url: string }>>([]);
  const [uploading, setUploading] = useState(false);

  const refresh = async () => {
    const { data, error: invokeError } = await supabase.functions.invoke('shopify-photo-session', {
      body: { action: 'status', token },
    });
    if (invokeError || !data?.success) {
      setStatus('error');
      setError(describeEdgeFunctionError('shopify-photo-session', invokeError, data, 'Photo upload session failed'));
      return;
    }
    const sessionStatus = data.session?.status;
    if (sessionStatus === 'expired') setStatus('expired');
    else if (sessionStatus === 'completed') setStatus('completed');
    else if (sessionStatus === 'cancelled') setStatus('error');
    else setStatus('ready');
    setTitle(data.listing?.title || '');
    setSku(data.listing?.sku || '');
    setPhotos(data.listing?.photos || []);
    setError(sessionStatus === 'cancelled' ? 'This upload session was cancelled.' : '');
  };

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('Invalid upload link.');
      return;
    }
    void refresh();
  }, [token]);

  const remaining = Math.max(0, MAX_SHOPIFY_PHOTOS - photos.length);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !token || remaining <= 0) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files).slice(0, remaining)) {
        if (!file.type.startsWith('image/')) continue;
        const image = await compressImageFile(file, SHOPIFY_PHOTO_MAX_EDGE_PX, 0.86);
        const { data, error: invokeError } = await supabase.functions.invoke('shopify-photo-session', {
          body: { action: 'upload', token, image },
        });
        if (invokeError || !data?.success) {
          setError(describeEdgeFunctionError('shopify-photo-session', invokeError, data, 'Photo upload failed'));
          break;
        }
        setPhotos(data.listing?.photos || []);
      }
    } catch {
      setError('Could not process that photo.');
    } finally {
      setUploading(false);
    }
  };

  const complete = async () => {
    await supabase.functions.invoke('shopify-photo-session', { body: { action: 'complete', token } });
    setStatus('completed');
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">PayMore / Snappy Wireless</p>
          <h1 className="text-xl font-bold">Add Listing Photos</h1>
        </div>
        <div className="rounded-lg border p-3 text-[13px]">
          <p><span className="text-muted-foreground">Product:</span> {title || '—'}</p>
          <p><span className="text-muted-foreground">Device:</span> {sku || '—'}</p>
          <p className="mt-1 font-medium">Photos Uploaded: {photos.length} / {MAX_SHOPIFY_PHOTOS}</p>
        </div>
        {status === 'ready' && (
          <>
            <button
              type="button"
              disabled={uploading || remaining <= 0}
              onClick={() => cameraRef.current?.click()}
              className="w-full h-12 rounded-md bg-primary text-primary-foreground font-semibold"
            >
              <Camera className="inline size-4 mr-2" /> TAKE PHOTO
            </button>
            <button
              type="button"
              disabled={uploading || remaining <= 0}
              onClick={() => galleryRef.current?.click()}
              className="w-full h-12 rounded-md border font-semibold"
            >
              <ImageIcon className="inline size-4 mr-2" /> CHOOSE FROM GALLERY
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }} />
            <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }} />
            <div>
              <p className="text-[12px] font-semibold mb-2">Uploaded Photos</p>
              <div className="flex flex-wrap gap-2">
                {photos.map((photo) => (
                  <img key={photo.id || photo.url} src={photo.url} alt="" className="size-16 object-cover rounded-md border" />
                ))}
              </div>
            </div>
            <button type="button" onClick={() => void complete()} className="w-full h-11 rounded-md bg-emerald-700 text-white font-semibold">
              <Check className="inline size-4 mr-1" /> DONE
            </button>
            {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
            {uploading ? <p className="text-[12px] text-muted-foreground">Uploading…</p> : null}
          </>
        )}
        {status === 'completed' && <p className="text-[14px] font-medium text-emerald-700">Photos received. You can return to the POS.</p>}
        {status === 'expired' && <p className="text-[14px] text-destructive">This upload link has expired.</p>}
        {status === 'error' && <p className="text-[14px] text-destructive">{error || 'This upload link is not available.'}</p>}
        {status === 'loading' && <p className="text-[13px] text-muted-foreground">Checking upload session…</p>}
      </div>
    </div>
  );
}
