import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  ScanLine, Camera, AlertCircle, Check, RefreshCw, QrCode, CreditCard, Loader2, X, ImageIcon,
} from 'lucide-react';

export interface ScanResult {
  firstName: string;
  middleName: string;
  lastName: string;
  dob: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  postalCode: string;
  idNumber: string;
  sex: string;
  height: string;
  weight: string;
  idType: 'drivers-license' | 'passport' | 'provincial-id' | 'other';
}

interface IdScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (data: ScanResult) => void;
}

function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<string> {
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

export default function IdScanner({ open, onOpenChange, onScan }: IdScannerProps) {
  const [mode, setMode] = useState<'qr' | 'photo'>('photo');
  const [status, setStatus] = useState<'idle' | 'scanning' | 'extracting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [parsedData, setParsedData] = useState<ScanResult | null>(null);
  const [frontPhoto, setFrontPhoto] = useState<string | null>(null);
  const [backPhoto, setBackPhoto] = useState<string | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<any>(null);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop?.().catch(() => {});
      } catch {}
      scannerRef.current = null;
    }
  }, []);

  // QR code scanning
  const startQrScanning = useCallback(async () => {
    setStatus('scanning');
    setErrorMsg('');
    setParsedData(null);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const readerId = 'qr-reader-region';
      await new Promise((r) => setTimeout(r, 300));
      const el = document.getElementById(readerId);
      if (!el) {
        setErrorMsg('Scanner element not found.');
        setStatus('error');
        return;
      }
      const scanner = new Html5Qrcode(readerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          console.log('QR scanned:', decodedText);
          try {
            const data = JSON.parse(decodedText);
            const result: ScanResult = {
              firstName: data.firstName || data.first_name || '',
              middleName: data.middleName || data.middle_name || '',
              lastName: data.lastName || data.last_name || '',
              dob: data.dob || data.date_of_birth || '',
              address1: data.address1 || data.address || '',
              address2: data.address2 || '',
              city: data.city || '',
              province: data.province || data.state || 'BC',
              postalCode: data.postalCode || data.postal_code || data.zip || '',
              idNumber: data.idNumber || data.id_number || data.id || '',
              sex: data.sex || data.gender || '',
              height: data.height || '',
              weight: data.weight || '',
              idType: data.idType || 'other',
            };
            setParsedData(result);
            setStatus('success');
            scanner.stop().catch(() => {});
          } catch {
            // Not JSON — treat raw text as ID number
            setParsedData({
              firstName: '', middleName: '', lastName: '', dob: '',
              address1: '', address2: '', city: '', province: 'BC', postalCode: '',
              idNumber: decodedText, sex: '', height: '', weight: '',
              idType: 'other',
            });
            setStatus('success');
            scanner.stop().catch(() => {});
          }
        },
        () => {} // continuous scan failures — ignore
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setErrorMsg('Camera permission denied. Please allow camera access.');
      } else if (msg.includes('NotFoundError')) {
        setErrorMsg('No camera found.');
      } else {
        setErrorMsg(`Camera error: ${msg}`);
      }
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (open && mode === 'qr') {
      const timer = setTimeout(() => startQrScanning(), 300);
      return () => { clearTimeout(timer); stopScanner(); };
    }
    return () => stopScanner();
  }, [open, mode, startQrScanning, stopScanner]);

  useEffect(() => {
    if (!open) {
      setStatus('idle');
      setErrorMsg('');
      setParsedData(null);
      setFrontPhoto(null);
      setBackPhoto(null);
      setMode('photo');
      stopScanner();
    }
  }, [open, stopScanner]);

  // Photo capture handlers
  const handlePhotoCapture = async (side: 'front' | 'back', files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const compressed = await compressImage(files[0]);
      if (side === 'front') setFrontPhoto(compressed);
      else setBackPhoto(compressed);
    } catch (err) {
      console.error('Photo capture error:', err);
      setErrorMsg('Failed to process photo. Please try again.');
    }
  };

  const handleExtract = async () => {
    if (!frontPhoto) {
      setErrorMsg('Please capture the front of the ID first.');
      return;
    }

    setStatus('extracting');
    setErrorMsg('');

    try {
      const { data, error } = await supabase.functions.invoke('extract-id-data', {
        body: { frontImage: frontPhoto, backImage: backPhoto },
      });

      if (error) {
        let errorMessage = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const textContent = await error.context?.text();
            errorMessage = textContent || error.message;
          } catch {
            errorMessage = error.message || 'Failed to read response';
          }
        }
        console.error('Extraction error:', errorMessage);
        setErrorMsg(`Extraction failed: ${errorMessage}`);
        setStatus('error');
        return;
      }

      if (data?.success && data?.data) {
        const d = data.data;
        const result: ScanResult = {
          firstName: d.firstName || '',
          middleName: d.middleName || '',
          lastName: d.lastName || '',
          dob: d.dob || '',
          address1: d.address1 || '',
          address2: d.address2 || '',
          city: d.city || '',
          province: d.province || 'BC',
          postalCode: d.postalCode || '',
          idNumber: d.idNumber || '',
          sex: d.sex || '',
          height: d.height || '',
          weight: d.weight || '',
          idType: d.idType || 'other',
        };
        setParsedData(result);
        setStatus('success');
      } else {
        setErrorMsg(data?.error || 'No data extracted from the ID. Try taking clearer photos.');
        setStatus('error');
      }
    } catch (err: any) {
      console.error('Extract error:', err);
      setErrorMsg(`Error: ${err.message}`);
      setStatus('error');
    }
  };

  const handleConfirm = () => {
    if (parsedData) {
      onScan(parsedData);
      onOpenChange(false);
    }
  };

  const handleRetryQr = () => {
    stopScanner();
    setStatus('idle');
    setErrorMsg('');
    setParsedData(null);
    setTimeout(() => startQrScanning(), 300);
  };

  const handleRetryPhoto = () => {
    setStatus('idle');
    setErrorMsg('');
    setParsedData(null);
    setFrontPhoto(null);
    setBackPhoto(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <CreditCard className="size-5 text-primary" />
              Scan Customer ID
            </DialogTitle>
            <div className="flex gap-1.5">
              <Button size="sm" variant={mode === 'photo' ? 'default' : 'outline'} className="h-7 text-[10px]"
                onClick={() => { stopScanner(); setMode('photo'); setStatus('idle'); setErrorMsg(''); setParsedData(null); }}>
                <Camera className="size-3 mr-1" />ID Photo
              </Button>
              <Button size="sm" variant={mode === 'qr' ? 'default' : 'outline'} className="h-7 text-[10px]"
                onClick={() => { setMode('qr'); setStatus('idle'); setErrorMsg(''); setParsedData(null); setFrontPhoto(null); setBackPhoto(null); }}>
                <QrCode className="size-3 mr-1" />QR Code
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 mt-1">

          {/* ═══════ QR CODE MODE ═══════ */}
          {mode === 'qr' && (
            <>
              <div className="relative bg-black rounded-lg overflow-hidden" style={{ minHeight: 260 }}>
                <div id="qr-reader-region" className="w-full" />
                {status === 'scanning' && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-black/70 text-white text-[10px] animate-pulse">
                      <ScanLine className="size-3 mr-1" />Scanning for QR code…
                    </Badge>
                  </div>
                )}
              </div>
              {status === 'error' && (
                <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                  <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[11px] text-destructive">{errorMsg}</p>
                    <Button size="sm" variant="outline" className="h-7 text-[10px] mt-2" onClick={handleRetryQr}>
                      <RefreshCw className="size-3 mr-1" />Retry
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Point camera at a QR code containing customer data. The QR code can contain JSON with customer fields or a plain ID number.
              </p>
            </>
          )}

          {/* ═══════ PHOTO MODE ═══════ */}
          {mode === 'photo' && status !== 'success' && (
            <>
              <p className="text-[11px] text-muted-foreground">
                Take or upload photos of the customer's ID (front required, back optional). AI will extract the information automatically.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {/* Front */}
                <div>
                  <p className="text-[11px] font-semibold mb-1.5 flex items-center gap-1">
                    <CreditCard className="size-3.5" /> Front of ID <span className="text-destructive">*</span>
                  </p>
                  {frontPhoto ? (
                    <div className="relative rounded-lg overflow-hidden border-2 border-primary/30 bg-secondary aspect-[1.6]">
                      <img src={frontPhoto} alt="Front of ID" className="w-full h-full object-cover" />
                      <button onClick={() => setFrontPhoto(null)}
                        className="absolute top-1 right-1 size-6 rounded-full bg-black/60 flex items-center justify-center cursor-pointer hover:bg-black/80 transition-colors">
                        <X className="size-3.5 text-white" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-primary/80 text-white text-[9px] text-center py-0.5 font-medium">
                        Front captured
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => frontRef.current?.click()}
                      className="w-full aspect-[1.6] rounded-lg border-2 border-dashed border-border hover:border-primary/40 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors cursor-pointer bg-secondary/30">
                      <Camera className="size-8 mb-1" />
                      <span className="text-[11px] font-medium">Capture Front</span>
                      <span className="text-[9px]">Tap to take photo or browse</span>
                    </button>
                  )}
                  <input ref={frontRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { handlePhotoCapture('front', e.target.files); e.target.value = ''; }} />
                </div>

                {/* Back */}
                <div>
                  <p className="text-[11px] font-semibold mb-1.5 flex items-center gap-1">
                    <CreditCard className="size-3.5 rotate-180" /> Back of ID <span className="text-muted-foreground text-[9px]">(optional)</span>
                  </p>
                  {backPhoto ? (
                    <div className="relative rounded-lg overflow-hidden border-2 border-emerald-300 bg-secondary aspect-[1.6]">
                      <img src={backPhoto} alt="Back of ID" className="w-full h-full object-cover" />
                      <button onClick={() => setBackPhoto(null)}
                        className="absolute top-1 right-1 size-6 rounded-full bg-black/60 flex items-center justify-center cursor-pointer hover:bg-black/80 transition-colors">
                        <X className="size-3.5 text-white" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-emerald-600/80 text-white text-[9px] text-center py-0.5 font-medium">
                        Back captured
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => backRef.current?.click()}
                      className="w-full aspect-[1.6] rounded-lg border-2 border-dashed border-border hover:border-emerald-400 flex flex-col items-center justify-center text-muted-foreground hover:text-emerald-600 transition-colors cursor-pointer bg-secondary/30">
                      <Camera className="size-8 mb-1" />
                      <span className="text-[11px] font-medium">Capture Back</span>
                      <span className="text-[9px]">Optional — may contain extra info</span>
                    </button>
                  )}
                  <input ref={backRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { handlePhotoCapture('back', e.target.files); e.target.value = ''; }} />
                </div>
              </div>

              {/* Extract button */}
              {frontPhoto && status !== 'extracting' && (
                <Button onClick={handleExtract} className="w-full h-10 text-[12px]">
                  <ImageIcon className="size-4 mr-1.5" />Extract Information from ID Photos
                </Button>
              )}

              {status === 'extracting' && (
                <div className="flex items-center justify-center gap-2 py-4 bg-primary/5 rounded-lg border border-primary/20">
                  <Loader2 className="size-5 text-primary animate-spin" />
                  <span className="text-[12px] font-medium text-primary">AI is analyzing ID photos…</span>
                </div>
              )}

              {status === 'error' && (
                <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                  <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[11px] text-destructive">{errorMsg}</p>
                    <Button size="sm" variant="outline" className="h-7 text-[10px] mt-2" onClick={handleRetryPhoto}>
                      <RefreshCw className="size-3 mr-1" />Retake Photos
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══════ RESULT PREVIEW ═══════ */}
          {status === 'success' && parsedData && (
            <div className="border-2 border-emerald-300 bg-emerald-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Check className="size-4 text-emerald-600" />
                <span className="text-[12px] font-semibold text-emerald-800">
                  {mode === 'photo' ? 'ID Data Extracted by AI' : 'QR Code Data Read'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                {parsedData.firstName && (
                  <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{parsedData.firstName} {parsedData.middleName} {parsedData.lastName}</span></div>
                )}
                {parsedData.dob && (
                  <div><span className="text-muted-foreground">DOB:</span> <span className="font-medium">{parsedData.dob}</span></div>
                )}
                {parsedData.idNumber && (
                  <div><span className="text-muted-foreground">ID#:</span> <span className="font-mono font-medium">{parsedData.idNumber}</span></div>
                )}
                {parsedData.sex && (
                  <div><span className="text-muted-foreground">Sex:</span> <span className="font-medium">{parsedData.sex}</span></div>
                )}
                {(parsedData.address1 || parsedData.city) && (
                  <div className="col-span-2"><span className="text-muted-foreground">Address:</span> <span className="font-medium">{parsedData.address1}{parsedData.address2 ? `, ${parsedData.address2}` : ''}, {parsedData.city} {parsedData.province} {parsedData.postalCode}</span></div>
                )}
                {parsedData.height && (
                  <div><span className="text-muted-foreground">Height:</span> <span className="font-medium">{parsedData.height}</span></div>
                )}
                {parsedData.weight && (
                  <div><span className="text-muted-foreground">Weight:</span> <span className="font-medium">{parsedData.weight}</span></div>
                )}
                {parsedData.idType && (
                  <div><span className="text-muted-foreground">ID Type:</span> <span className="font-medium capitalize">{parsedData.idType.replace(/-/g, ' ')}</span></div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <Button className="flex-1 h-9 text-[12px] bg-emerald-600 hover:bg-emerald-700" onClick={handleConfirm}>
                  <Check className="size-3.5 mr-1.5" />Use This Data
                </Button>
                <Button variant="outline" size="sm" className="h-9 text-[10px]"
                  onClick={mode === 'photo' ? handleRetryPhoto : handleRetryQr}>
                  <RefreshCw className="size-3 mr-1" />Redo
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
