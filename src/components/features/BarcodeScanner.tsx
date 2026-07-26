import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScanLine, Camera, AlertCircle, Check, RefreshCw, Type } from 'lucide-react';

export interface ScanResult {
  firstName: string;
  middleName: string;
  lastName: string;
  dob: string;
  address1: string;
  city: string;
  province: string;
  postalCode: string;
  idNumber: string;
  sex: string;
  height: string;
  weight: string;
  idType: 'drivers-license';
}

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (data: ScanResult) => void;
}

function parseAAMVA(raw: string): ScanResult | null {
  const fields: Record<string, string> = {};

  // Normalize line endings and split
  const cleaned = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n');

  // Known AAMVA field codes
  const codes = [
    'DCS', 'DAC', 'DCT', 'DAD', 'DBB', 'DAG', 'DAI', 'DAJ', 'DAK',
    'DAQ', 'DBC', 'DAU', 'DAW', 'DAY', 'DBA', 'DCD', 'DCF', 'DCG',
    'DCH', 'DCI', 'DCJ', 'DCK', 'DBD', 'DBN', 'DBO', 'DBS',
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3) continue;

    // Try to match known field codes
    for (const code of codes) {
      if (trimmed.startsWith(code)) {
        fields[code] = trimmed.substring(code.length).trim();
        break;
      }
    }

    // Also try parsing concatenated fields (no newlines between them)
    if (trimmed.length > 6) {
      let pos = 0;
      while (pos < trimmed.length - 3) {
        let matched = false;
        for (const code of codes) {
          if (trimmed.substring(pos).startsWith(code)) {
            // Find next code or end of string
            let endPos = trimmed.length;
            for (const nextCode of codes) {
              const nextIdx = trimmed.indexOf(nextCode, pos + code.length);
              if (nextIdx > pos + code.length && nextIdx < endPos) {
                endPos = nextIdx;
              }
            }
            fields[code] = trimmed.substring(pos + code.length, endPos).trim();
            pos = endPos;
            matched = true;
            break;
          }
        }
        if (!matched) pos++;
      }
    }
  }

  // Need at least a last name or ID number to be valid
  if (!fields['DCS'] && !fields['DAQ'] && !fields['DAC']) return null;

  // Parse DOB from MMDDYYYY or YYYYMMDD
  let dob = '';
  if (fields['DBB']) {
    const raw = fields['DBB'].replace(/[^0-9]/g, '');
    if (raw.length === 8) {
      // Try MMDDYYYY first (US/Canada standard)
      const mm = raw.substring(0, 2);
      const dd = raw.substring(2, 4);
      const yyyy = raw.substring(4, 8);
      if (parseInt(mm) <= 12 && parseInt(dd) <= 31) {
        dob = `${yyyy}-${mm}-${dd}`;
      } else {
        // Try YYYYMMDD
        dob = `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
      }
    }
  }

  // Parse sex
  let sex = '';
  if (fields['DBC'] === '1') sex = 'Male';
  else if (fields['DBC'] === '2') sex = 'Female';

  // Parse height (may be in format like "510" for 5'10" or "172 cm")
  let height = fields['DAU'] || '';
  if (height && /^\d{3}$/.test(height)) {
    // Likely format: first digit = feet, remaining = inches
    height = height;
  }

  // Parse weight
  let weight = fields['DAW'] || '';
  if (weight) {
    weight = weight.replace(/[^0-9]/g, '');
  }

  // Clean postal code
  let postalCode = fields['DAK'] || '';
  postalCode = postalCode.replace(/\s+/g, ' ').trim();
  // Canadian postal codes: take first 7 chars (A1A 1A1)
  if (postalCode.length > 7) postalCode = postalCode.substring(0, 7).trim();

  return {
    firstName: fields['DAC'] || fields['DCT'] || '',
    middleName: fields['DAD'] || '',
    lastName: fields['DCS'] || '',
    dob,
    address1: fields['DAG'] || '',
    city: fields['DAI'] || '',
    province: fields['DAJ'] || 'BC',
    postalCode,
    idNumber: fields['DAQ'] || '',
    sex,
    height,
    weight,
    idType: 'drivers-license',
  };
}

export default function BarcodeScanner({ open, onOpenChange, onScan }: BarcodeScannerProps) {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [parsedData, setParsedData] = useState<ScanResult | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [rawScanned, setRawScanned] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const stopCamera = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop?.().catch(() => {});
      } catch {}
      scannerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startScanning = useCallback(async () => {
    setStatus('scanning');
    setErrorMsg('');
    setParsedData(null);
    setRawScanned('');

    try {
      // Dynamic import to handle potential loading issues
      const { Html5Qrcode } = await import('html5-qrcode');

      const readerId = 'barcode-reader-region';

      // Wait for DOM element
      await new Promise((r) => setTimeout(r, 200));

      const el = document.getElementById(readerId);
      if (!el) {
        setErrorMsg('Scanner element not found. Please try again.');
        setStatus('error');
        return;
      }

      const scanner = new Html5Qrcode(readerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 320, height: 180 },
          formatsToSupport: [8], // 8 = PDF_417
        },
        (decodedText) => {
          console.log('Barcode scanned:', decodedText);
          setRawScanned(decodedText);
          const parsed = parseAAMVA(decodedText);
          if (parsed) {
            setParsedData(parsed);
            setStatus('success');
            scanner.stop().catch(() => {});
          } else {
            setErrorMsg('Scanned but could not parse driver\'s license data. Showing raw data below.');
            setRawScanned(decodedText);
            setStatus('error');
            scanner.stop().catch(() => {});
          }
        },
        () => {
          // Scan failure (no barcode found) - this fires continuously, ignore
        }
      );
    } catch (err: any) {
      console.error('Scanner error:', err);
      const msg = err?.message || String(err);
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setErrorMsg('Camera permission denied. Please allow camera access and try again, or use manual entry.');
      } else if (msg.includes('NotFoundError') || msg.includes('no camera')) {
        setErrorMsg('No camera found. Please use manual entry mode.');
      } else {
        setErrorMsg(`Camera error: ${msg}. Try manual entry instead.`);
      }
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (open && !manualMode) {
      const timer = setTimeout(() => startScanning(), 300);
      return () => {
        clearTimeout(timer);
        stopCamera();
      };
    }
    return () => stopCamera();
  }, [open, manualMode, startScanning, stopCamera]);

  useEffect(() => {
    if (!open) {
      setStatus('idle');
      setErrorMsg('');
      setParsedData(null);
      setManualMode(false);
      setManualInput('');
      setRawScanned('');
      stopCamera();
    }
  }, [open, stopCamera]);

  const handleManualParse = () => {
    if (!manualInput.trim()) return;
    const parsed = parseAAMVA(manualInput);
    if (parsed) {
      setParsedData(parsed);
      setStatus('success');
    } else {
      setErrorMsg('Could not parse the data. Ensure it contains AAMVA PDF417 barcode data.');
    }
  };

  const handleConfirm = () => {
    if (parsedData) {
      onScan(parsedData);
      onOpenChange(false);
    }
  };

  const handleRetry = () => {
    stopCamera();
    setStatus('idle');
    setErrorMsg('');
    setParsedData(null);
    setRawScanned('');
    setTimeout(() => startScanning(), 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <ScanLine className="size-5 text-primary" />
              Scan Driver's License
            </DialogTitle>
            <div className="flex gap-1.5">
              <Button size="sm" variant={manualMode ? 'default' : 'outline'} className="h-7 text-[10px]"
                onClick={() => { stopCamera(); setManualMode(true); setStatus('idle'); setErrorMsg(''); }}>
                <Type className="size-3 mr-1" />Manual
              </Button>
              <Button size="sm" variant={!manualMode ? 'default' : 'outline'} className="h-7 text-[10px]"
                onClick={() => { setManualMode(false); }}>
                <Camera className="size-3 mr-1" />Camera
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          {!manualMode ? (
            <>
              {/* Camera view */}
              <div className="relative bg-black rounded-lg overflow-hidden" style={{ minHeight: 260 }}>
                <div id="barcode-reader-region" className="w-full" />
                {status === 'scanning' && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-black/70 text-white text-[10px] animate-pulse">
                      <ScanLine className="size-3 mr-1" />Scanning for PDF417 barcode…
                    </Badge>
                  </div>
                )}
              </div>

              {status === 'error' && (
                <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                  <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[11px] text-destructive">{errorMsg}</p>
                    {rawScanned && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-muted-foreground cursor-pointer">Raw scanned data</summary>
                        <pre className="text-[9px] mt-1 p-2 bg-secondary rounded max-h-24 overflow-y-auto break-all whitespace-pre-wrap">{rawScanned}</pre>
                      </details>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-[10px] mt-2" onClick={handleRetry}>
                      <RefreshCw className="size-3 mr-1" />Retry
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Manual entry */}
              <div>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Paste raw PDF417 barcode data from a scanner app or device:
                </p>
                <Textarea
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="text-[11px] font-mono min-h-[120px]"
                  placeholder="Paste AAMVA barcode data here…"
                />
                <Button size="sm" className="mt-2 h-8 text-[11px]" onClick={handleManualParse} disabled={!manualInput.trim()}>
                  Parse Data
                </Button>
                {errorMsg && (
                  <p className="text-[10px] text-destructive mt-1.5">{errorMsg}</p>
                )}
              </div>
            </>
          )}

          {/* Parsed result preview */}
          {status === 'success' && parsedData && (
            <div className="border-2 border-emerald-300 bg-emerald-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Check className="size-4 text-emerald-600" />
                <span className="text-[12px] font-semibold text-emerald-800">License Data Extracted</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{parsedData.firstName} {parsedData.middleName} {parsedData.lastName}</span></div>
                <div><span className="text-muted-foreground">DOB:</span> <span className="font-medium">{parsedData.dob}</span></div>
                <div><span className="text-muted-foreground">ID#:</span> <span className="font-mono font-medium">{parsedData.idNumber}</span></div>
                <div><span className="text-muted-foreground">Sex:</span> <span className="font-medium">{parsedData.sex}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Address:</span> <span className="font-medium">{parsedData.address1}, {parsedData.city} {parsedData.province} {parsedData.postalCode}</span></div>
                {parsedData.height && <div><span className="text-muted-foreground">Height:</span> <span className="font-medium">{parsedData.height}</span></div>}
                {parsedData.weight && <div><span className="text-muted-foreground">Weight:</span> <span className="font-medium">{parsedData.weight}</span></div>}
              </div>
              <Button className="w-full mt-3 h-9 text-[12px] bg-emerald-600 hover:bg-emerald-700" onClick={handleConfirm}>
                <Check className="size-3.5 mr-1.5" />Use This Data & Fill Customer Form
              </Button>
            </div>
          )}

          {/* Help text */}
          <p className="text-[10px] text-muted-foreground">
            Position the back of the driver's license so the PDF417 barcode fills the scanning area. Ensure good lighting for best results.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
