import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  Smartphone, QrCode, Loader2, Check, RefreshCw, X, Clock,
  AlertCircle, Shield, WifiOff, Camera, CreditCard,
} from 'lucide-react';
import type { ScanResult } from '@/components/features/IdScanner';

interface QrIdScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (data: ScanResult) => void;
}

type SessionStatus = 'creating' | 'waiting' | 'uploading' | 'processing' | 'completed' | 'expired' | 'error';

interface SessionData {
  token: string;
  expiresAt: string;
  status: SessionStatus;
}

function getConfidenceColor(score: number): string {
  if (score >= 0.8) return 'text-emerald-600';
  if (score >= 0.5) return 'text-amber-600';
  return 'text-red-600';
}

function getConfidenceLabel(score: number): string {
  if (score >= 0.8) return 'High';
  if (score >= 0.5) return 'Medium';
  return 'Low';
}

export default function QrIdScanner({ open, onOpenChange, onScan }: QrIdScannerProps) {
  const [status, setStatus] = useState<SessionStatus>('creating');
  const [session, setSession] = useState<SessionData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [extractedData, setExtractedData] = useState<ScanResult | null>(null);
  const [confidenceScores, setConfidenceScores] = useState<Record<string, number> | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<SessionData | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const expireSession = useCallback(async () => {
    if (sessionRef.current) {
      await supabase.functions.invoke('id-scan-session', {
        body: { action: 'expire', token: sessionRef.current.token },
      }).catch(() => {});
    }
  }, []);

  // Generate QR code as data URL using canvas
  const generateQrImage = useCallback(async (text: string) => {
    try {
      const QRCode = await import('qrcode');
      const url = await QRCode.toDataURL(text, {
        width: 320,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'M',
      });
      return url;
    } catch (err) {
      console.error('QR generation error:', err);
      return null;
    }
  }, []);

  const createSession = useCallback(async () => {
    setStatus('creating');
    setErrorMsg('');
    setExtractedData(null);
    setConfidenceScores(null);
    setQrDataUrl(null);
    cleanup();

    try {
      const { data, error } = await supabase.functions.invoke('id-scan-session', {
        body: { action: 'create' },
      });

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { msg = await error.context?.text() || msg; } catch {}
        }
        throw new Error(msg);
      }

      if (!data?.success || !data?.session) {
        throw new Error(data?.error || 'Failed to create session');
      }

      const { token, expiresAt } = data.session;
      const uploadUrl = `${window.location.origin}/id-upload/${token}`;
      console.log('Session created. Upload URL:', uploadUrl);

      const qrImg = await generateQrImage(uploadUrl);
      if (!qrImg) throw new Error('Failed to generate QR code');

      const sessionData: SessionData = { token, expiresAt, status: 'waiting' };
      setSession(sessionData);
      sessionRef.current = sessionData;
      setQrDataUrl(qrImg);
      setStatus('waiting');

      // Start countdown timer
      const expiryTime = new Date(expiresAt).getTime();
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));
        setTimeRemaining(remaining);
        if (remaining <= 0) {
          setStatus('expired');
          cleanup();
        }
      }, 1000);

      // Start polling for session status
      pollRef.current = setInterval(async () => {
        try {
          const { data: statusData, error: statusError } = await supabase.functions.invoke('id-scan-session', {
            body: { action: 'status', token },
          });

          if (statusError || !statusData?.success) return;

          const sStatus = statusData.session.status;
          console.log('Poll status:', sStatus);

          if (sStatus === 'uploading') {
            setStatus('uploading');
          } else if (sStatus === 'processing') {
            setStatus('processing');
          } else if (sStatus === 'completed') {
            cleanup();
            setStatus('completed');

            const d = statusData.session.extractedData;
            if (d) {
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
              setExtractedData(result);
              setConfidenceScores(statusData.session.confidenceScores || null);
            }
          } else if (sStatus === 'error') {
            cleanup();
            setStatus('error');
            setErrorMsg(statusData.session.errorMessage || 'Extraction failed');
          } else if (sStatus === 'expired') {
            cleanup();
            setStatus('expired');
          }
        } catch (err) {
          console.error('Poll error:', err);
        }
      }, 2500);

    } catch (err: any) {
      console.error('Create session error:', err);
      setErrorMsg(err.message || 'Failed to create session');
      setStatus('error');
    }
  }, [cleanup, generateQrImage]);

  // Auto-create session when dialog opens
  useEffect(() => {
    if (open) {
      createSession();
    }
    return () => {
      cleanup();
    };
  }, [open]);

  // Expire session on close
  useEffect(() => {
    if (!open) {
      expireSession();
      setSession(null);
      sessionRef.current = null;
      setStatus('creating');
      setQrDataUrl(null);
      setExtractedData(null);
      setConfidenceScores(null);
      setErrorMsg('');
      setTimeRemaining(0);
    }
  }, [open, expireSession]);

  const handleConfirm = () => {
    if (extractedData) {
      onScan(extractedData);
      onOpenChange(false);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] flex items-center gap-2">
            <Smartphone className="size-5 text-primary" />
            Scan ID via Phone
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">

          {/* ═══ CREATING ═══ */}
          {status === 'creating' && (
            <div className="flex flex-col items-center py-10">
              <Loader2 className="size-10 text-primary animate-spin mb-3" />
              <p className="text-[13px] font-medium">Creating secure session…</p>
              <p className="text-[11px] text-muted-foreground mt-1">Generating QR code for ID upload</p>
            </div>
          )}

          {/* ═══ WAITING — QR CODE DISPLAYED ═══ */}
          {status === 'waiting' && qrDataUrl && (
            <>
              <div className="text-center">
                <p className="text-[12px] text-muted-foreground mb-3">
                  Ask the customer to scan this QR code with their phone to upload their ID photos
                </p>

                {/* QR Code */}
                <div className="inline-block p-4 bg-white rounded-xl border-2 border-primary/20 shadow-sm">
                  <img src={qrDataUrl} alt="QR Code" className="w-64 h-64" />
                </div>

                {/* Timer + Security badges */}
                <div className="flex items-center justify-center gap-3 mt-3">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono ${timeRemaining < 60 ? 'border-destructive text-destructive animate-pulse' : 'border-primary text-primary'}`}
                  >
                    <Clock className="size-3 mr-1" />
                    Expires in {formatTime(timeRemaining)}
                  </Badge>
                  <Badge variant="secondary" className="text-[9px]">
                    <Shield className="size-2.5 mr-0.5" />Single-use
                  </Badge>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
                <p className="text-[11px] font-semibold text-foreground">Instructions for Customer:</p>
                <div className="grid gap-1.5">
                  {[
                    { n: 1, t: 'Scan the QR code with your phone camera' },
                    { n: 2, t: 'Take or upload a photo of the front of your ID' },
                    { n: 3, t: 'Optionally, add the back of the ID' },
                    { n: 4, t: 'Tap "Submit" — data fills in automatically here' },
                  ].map((s) => (
                    <div key={s.n} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-primary">{s.n}</span>
                      </div>
                      {s.t}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-[11px]" onClick={createSession}>
                  <RefreshCw className="size-3 mr-1" />New QR Code
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {/* ═══ UPLOADING ═══ */}
          {status === 'uploading' && (
            <div className="flex flex-col items-center py-8">
              <div className="size-16 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                <Camera className="size-8 text-blue-600 animate-pulse" />
              </div>
              <p className="text-[14px] font-semibold text-blue-800">Customer is uploading photos…</p>
              <p className="text-[11px] text-muted-foreground mt-1">Photos are being securely received</p>
              <Loader2 className="size-5 text-blue-500 animate-spin mt-3" />
            </div>
          )}

          {/* ═══ PROCESSING ═══ */}
          {status === 'processing' && (
            <div className="flex flex-col items-center py-8">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Loader2 className="size-8 text-primary animate-spin" />
              </div>
              <p className="text-[14px] font-semibold">AI is extracting ID information…</p>
              <p className="text-[11px] text-muted-foreground mt-1">Analyzing photos with OCR. This takes a few seconds.</p>
            </div>
          )}

          {/* ═══ COMPLETED ═══ */}
          {status === 'completed' && extractedData && (
            <div className="border-2 border-emerald-300 bg-emerald-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Check className="size-5 text-emerald-600" />
                <span className="text-[13px] font-semibold text-emerald-800">ID Data Extracted Successfully</span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                {extractedData.firstName && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">
                      {extractedData.firstName} {extractedData.middleName} {extractedData.lastName}
                    </span>
                    {confidenceScores?.firstName != null && (
                      <span className={`text-[8px] font-mono ${getConfidenceColor(confidenceScores.firstName)}`}>
                        {getConfidenceLabel(confidenceScores.firstName)}
                      </span>
                    )}
                  </div>
                )}
                {extractedData.dob && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">DOB:</span>
                    <span className="font-medium">{extractedData.dob}</span>
                    {confidenceScores?.dob != null && (
                      <span className={`text-[8px] font-mono ${getConfidenceColor(confidenceScores.dob)}`}>
                        {getConfidenceLabel(confidenceScores.dob)}
                      </span>
                    )}
                  </div>
                )}
                {extractedData.idNumber && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">ID#:</span>
                    <span className="font-mono font-medium">{extractedData.idNumber}</span>
                    {confidenceScores?.idNumber != null && (
                      <span className={`text-[8px] font-mono ${getConfidenceColor(confidenceScores.idNumber)}`}>
                        {getConfidenceLabel(confidenceScores.idNumber)}
                      </span>
                    )}
                  </div>
                )}
                {extractedData.sex && (
                  <div>
                    <span className="text-muted-foreground">Sex:</span>{' '}
                    <span className="font-medium">{extractedData.sex}</span>
                  </div>
                )}
                {(extractedData.address1 || extractedData.city) && (
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-muted-foreground">Address:</span>
                    <span className="font-medium truncate">
                      {extractedData.address1}
                      {extractedData.address2 ? `, ${extractedData.address2}` : ''}, {extractedData.city}{' '}
                      {extractedData.province} {extractedData.postalCode}
                    </span>
                    {confidenceScores?.address1 != null && (
                      <span className={`text-[8px] font-mono shrink-0 ${getConfidenceColor(confidenceScores.address1)}`}>
                        {getConfidenceLabel(confidenceScores.address1)}
                      </span>
                    )}
                  </div>
                )}
                {extractedData.height && (
                  <div>
                    <span className="text-muted-foreground">Height:</span>{' '}
                    <span className="font-medium">{extractedData.height}</span>
                  </div>
                )}
                {extractedData.weight && (
                  <div>
                    <span className="text-muted-foreground">Weight:</span>{' '}
                    <span className="font-medium">{extractedData.weight}</span>
                  </div>
                )}
                {extractedData.idType && (
                  <div>
                    <span className="text-muted-foreground">ID Type:</span>{' '}
                    <span className="font-medium capitalize">{extractedData.idType.replace(/-/g, ' ')}</span>
                  </div>
                )}
              </div>

              {/* Confidence summary */}
              {confidenceScores && (
                <div className="mt-3 pt-2 border-t border-emerald-200">
                  <p className="text-[9px] text-emerald-700 font-medium mb-1">Confidence Scores:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(confidenceScores)
                      .filter(([, v]) => v > 0)
                      .map(([key, val]) => (
                        <Badge
                          key={key}
                          variant="outline"
                          className={`text-[8px] ${val >= 0.8 ? 'border-emerald-400 text-emerald-700' : val >= 0.5 ? 'border-amber-400 text-amber-700' : 'border-red-400 text-red-700'}`}
                        >
                          {key}: {Math.round(val * 100)}%
                        </Badge>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Button
                  className="flex-1 h-9 text-[12px] bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleConfirm}
                >
                  <Check className="size-3.5 mr-1.5" />Use This Data
                </Button>
                <Button variant="outline" size="sm" className="h-9 text-[10px]" onClick={createSession}>
                  <RefreshCw className="size-3 mr-1" />Rescan
                </Button>
              </div>

              <p className="text-[9px] text-emerald-600 mt-2 text-center">
                Fields with low confidence can be corrected in the customer form after import.
              </p>
            </div>
          )}

          {/* ═══ EXPIRED ═══ */}
          {status === 'expired' && (
            <div className="flex flex-col items-center py-8">
              <div className="size-16 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                <Clock className="size-8 text-amber-500" />
              </div>
              <p className="text-[14px] font-semibold text-amber-800">Session Expired</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                The QR code has expired for security. Generate a new one.
              </p>
              <Button onClick={createSession} className="mt-4 h-9 text-[12px]">
                <RefreshCw className="size-3.5 mr-1.5" />Generate New QR Code
              </Button>
            </div>
          )}

          {/* ═══ ERROR ═══ */}
          {status === 'error' && (
            <div className="flex flex-col items-center py-6">
              <div className="size-14 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                <AlertCircle className="size-7 text-destructive" />
              </div>
              <p className="text-[13px] font-semibold text-destructive">Something went wrong</p>
              <p className="text-[11px] text-muted-foreground mt-1 text-center max-w-xs">{errorMsg}</p>
              <div className="flex gap-2 mt-4">
                <Button onClick={createSession} variant="outline" className="h-9 text-[11px]">
                  <RefreshCw className="size-3.5 mr-1.5" />Retry
                </Button>
                <Button variant="ghost" className="h-9 text-[11px]" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
