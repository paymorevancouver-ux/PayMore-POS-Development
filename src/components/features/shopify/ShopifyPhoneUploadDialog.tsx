import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { photoUploadPublicPath } from '@/lib/shopify/photoSessions';
import { listingPhotoSources, listingPhotosSignature } from '@/lib/shopify/photos';
import { MAX_SHOPIFY_PHOTOS } from '@/lib/shopify/constants';
import { describeEdgeFunctionError } from '@/lib/shopify/functionErrors';
import type { ShopifyListing, ShopifyListingPhoto } from '@/types/shopify';
import { QrCode, RefreshCw } from 'lucide-react';

export default function ShopifyPhoneUploadDialog({
  open,
  listing,
  storeId,
  employeeId,
  onOpenChange,
  onPhotos,
}: {
  open: boolean;
  listing: ShopifyListing;
  storeId: string;
  employeeId?: string | null;
  onOpenChange: (open: boolean) => void;
  onPhotos: (photos: ShopifyListingPhoto[]) => void;
}) {
  const [qr, setQr] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('creating');
  const [error, setError] = useState('');
  const [count, setCount] = useState(listingPhotoSources(listing.photos).length);
  const pollRef = useRef<number | null>(null);
  const signatureRef = useRef(listingPhotosSignature(listing.photos));

  const stop = useCallback(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const createSession = useCallback(async () => {
    setStatus('creating');
    setError('');
    setQr('');
    stop();
    const { data, error: invokeError } = await supabase.functions.invoke('shopify-photo-session', {
      body: {
        action: 'create',
        listing_id: listing.id,
        store_id: storeId,
        employee_id: employeeId,
        origin: window.location.origin,
      },
    });
    if (invokeError || !data?.success) {
      setStatus('error');
      setError(describeEdgeFunctionError(
        'shopify-photo-session',
        invokeError,
        data,
        'QR photo session creation failed',
      ));
      return;
    }
    const nextToken = String(data.session?.token || data.session_token || '');
    if (!nextToken) {
      setStatus('error');
      setError('QR photo session creation failed: function shopify-photo-session did not return a session token.');
      return;
    }
    const QRCode = await import('qrcode');
    const url = String(data.upload_url || data.session?.upload_url || `${window.location.origin}${photoUploadPublicPath(nextToken)}`);
    setToken(nextToken);
    setQr(await QRCode.toDataURL(url, { width: 320, margin: 2, errorCorrectionLevel: 'M' }));
    setStatus('waiting');
    setCount(data.listing?.photoCount || listingPhotoSources(listing.photos).length);
    pollRef.current = window.setInterval(async () => {
      const { data: statusData } = await supabase.functions.invoke('shopify-photo-session', {
        body: { action: 'status', token: nextToken },
      });
      if (!statusData?.success) return;
      const nextPhotos = statusData.listing?.photos;
      if (Array.isArray(nextPhotos)) {
        const signature = listingPhotosSignature(nextPhotos);
        if (signature !== signatureRef.current) {
          signatureRef.current = signature;
          onPhotos(nextPhotos);
        }
      }
      setCount(statusData.listing?.photoCount || 0);
      if (statusData.session?.status === 'completed') {
        setStatus('completed');
        stop();
      }
      if (statusData.session?.status === 'expired' || statusData.session?.status === 'cancelled') {
        setStatus(statusData.session.status);
        stop();
      }
    }, 2000);
  }, [employeeId, listing.id, listing.photos, onPhotos, stop, storeId]);

  useEffect(() => {
    if (open) void createSession();
    return () => stop();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) stop(); onOpenChange(next); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Photos From Phone</DialogTitle>
        </DialogHeader>
        <p className="text-[13px]">Scan this QR code with your phone to add photos to this listing.</p>
        <div className="rounded-md border bg-muted/30 p-3 text-[12px]">
          <p className="font-mono font-semibold">{listing.sku}</p>
          <p>{listing.title}</p>
          <p className="text-muted-foreground mt-1">{count} / {MAX_SHOPIFY_PHOTOS} photos</p>
        </div>
        <div className="flex justify-center min-h-[240px] items-center">
          {qr && status === 'waiting' ? <img src={qr} alt="Photo upload QR code" className="w-64 h-64" /> : null}
          {status === 'creating' ? <p className="text-[12px] text-muted-foreground">Generating QR…</p> : null}
          {status === 'completed' ? <p className="text-[13px] font-medium text-emerald-700">Photos received successfully.</p> : null}
          {status === 'expired' ? <p className="text-[13px] text-destructive">This QR code expired.</p> : null}
          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" onClick={() => { if (token) void supabase.functions.invoke('shopify-photo-session', { body: { action: 'cancel', token } }); void createSession(); }}>
            <RefreshCw className="size-3.5 mr-1" /> Generate New QR
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <QrCode className="size-3" /> Closing this window keeps uploaded photos on the listing.
        </p>
      </DialogContent>
    </Dialog>
  );
}
