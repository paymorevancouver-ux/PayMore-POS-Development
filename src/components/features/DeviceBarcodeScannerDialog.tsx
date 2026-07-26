import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScanLine, AlertCircle, RefreshCw } from 'lucide-react';

interface DeviceBarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (deviceCode: string) => void;
}

export default function DeviceBarcodeScannerDialog({ open, onOpenChange, onScan }: DeviceBarcodeScannerDialogProps) {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const scannerRef = { current: null as any };

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop?.().catch(() => {});
      } catch {}
      scannerRef.current = null;
    }
  }, []);

  const startScanning = useCallback(async () => {
    setStatus('scanning');
    setErrorMsg('');

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      await new Promise((r) => setTimeout(r, 300));

      const el = document.getElementById('device-barcode-reader');
      if (!el) {
        setErrorMsg('Scanner element not found.');
        setStatus('error');
        return;
      }

      const scanner = new Html5Qrcode('device-barcode-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 280, height: 120 },
        },
        (decodedText) => {
          console.log('Device barcode scanned:', decodedText);
          const code = decodedText.trim();
          scanner.stop().catch(() => {});
          onScan(code);
          onOpenChange(false);
        },
        () => {
          // No barcode found this frame — ignore
        }
      );
    } catch (err: any) {
      console.error('Barcode scanner error:', err);
      const msg = err?.message || String(err);
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setErrorMsg('Camera permission denied. Please allow camera access.');
      } else if (msg.includes('NotFoundError') || msg.includes('no camera')) {
        setErrorMsg('No camera found on this device.');
      } else {
        setErrorMsg(`Camera error: ${msg}`);
      }
      setStatus('error');
    }
  }, [onScan, onOpenChange]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => startScanning(), 300);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    }
    return () => stopScanner();
  }, [open, startScanning, stopScanner]);

  useEffect(() => {
    if (!open) {
      setStatus('idle');
      setErrorMsg('');
      stopScanner();
    }
  }, [open, stopScanner]);

  const handleRetry = () => {
    stopScanner();
    setStatus('idle');
    setErrorMsg('');
    setTimeout(() => startScanning(), 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] flex items-center gap-2">
            <ScanLine className="size-5 text-primary" />
            Scan Device Barcode
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ minHeight: 240 }}>
            <div id="device-barcode-reader" className="w-full" />
            {status === 'scanning' && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-black/70 text-white text-[10px] animate-pulse">
                  <ScanLine className="size-3 mr-1" />Point camera at device barcode…
                </Badge>
              </div>
            )}
          </div>

          {status === 'error' && (
            <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[11px] text-destructive">{errorMsg}</p>
                <Button size="sm" variant="outline" className="h-7 text-[10px] mt-2" onClick={handleRetry}>
                  <RefreshCw className="size-3 mr-1" />Retry
                </Button>
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground text-center">
            Scan the Code 128 barcode on the device label to automatically find and add it to the cart.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
