import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  Camera, CreditCard, Check, Loader2, AlertCircle, X,
  Upload, Shield, ChevronRight, RefreshCw, ImageIcon,
} from 'lucide-react';

type PageStatus = 'loading' | 'ready' | 'uploading' | 'processing' | 'success' | 'expired' | 'used' | 'error';

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

export default function IdUploadPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<PageStatus>('loading');
  const [frontPhoto, setFrontPhoto] = useState<string | null>(null);
  const [backPhoto, setBackPhoto] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [progressText, setProgressText] = useState('');
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  // Validate session on mount
  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('Invalid link. No session token found.');
      return;
    }

    const checkSession = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('id-scan-session', {
          body: { action: 'status', token },
        });

        if (error) {
          let msg = error.message;
          if (error instanceof FunctionsHttpError) {
            try { msg = await error.context?.text() || msg; } catch {}
          }
          throw new Error(msg);
        }

        if (!data?.success) {
          throw new Error(data?.error || 'Session not found');
        }

        const s = data.session.status;
        if (s === 'expired') {
          setStatus('expired');
        } else if (s === 'completed' || s === 'processing' || s === 'uploading') {
          setStatus('used');
        } else if (s === 'pending') {
          setStatus('ready');
        } else {
          setStatus('error');
          setErrorMsg('Invalid session status');
        }
      } catch (err: any) {
        console.error('Session check error:', err);
        setStatus('error');
        setErrorMsg(err.message || 'Failed to validate session');
      }
    };

    checkSession();
  }, [token]);

  const handleCapture = async (side: 'front' | 'back', files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const compressed = await compressImage(files[0]);
      if (side === 'front') setFrontPhoto(compressed);
      else setBackPhoto(compressed);
    } catch (err) {
      console.error('Photo error:', err);
      setErrorMsg('Failed to process photo. Try again.');
    }
  };

  const handleSubmit = async () => {
    if (!frontPhoto || !token) return;

    setStatus('uploading');
    setProgressText('Uploading photos securely…');

    try {
      setProgressText('Analyzing ID with AI…');
      setStatus('processing');

      const { data, error } = await supabase.functions.invoke('id-scan-session', {
        body: { action: 'upload', token, frontImage: frontPhoto, backImage: backPhoto },
      });

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const statusCode = error.context?.status ?? 500;
            const textContent = await error.context?.text();
            msg = textContent || error.message;
            if (statusCode === 410) { setStatus('expired'); return; }
            if (statusCode === 409) { setStatus('used'); return; }
          } catch {}
        }
        throw new Error(msg);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Extraction failed');
      }

      setStatus('success');
    } catch (err: any) {
      console.error('Upload error:', err);
      setStatus('error');
      setErrorMsg(err.message || 'Upload failed');
    }
  };

  const handleRetry = () => {
    setFrontPhoto(null);
    setBackPhoto(null);
    setErrorMsg('');
    setStatus('ready');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="size-9 rounded-lg bg-emerald-600 flex items-center justify-center">
          <Shield className="size-5 text-white" />
        </div>
        <div>
          <h1 className="text-[15px] font-bold text-slate-900">Paymore — Secure ID Upload</h1>
          <p className="text-[11px] text-slate-500">Your photos are encrypted and processed securely</p>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">

        {/* ═══ LOADING ═══ */}
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="size-10 text-emerald-600 animate-spin mb-3" />
            <p className="text-[14px] font-medium text-slate-700">Validating session…</p>
          </div>
        )}

        {/* ═══ READY — Upload Form ═══ */}
        {status === 'ready' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="size-5 text-emerald-600" />
                <h2 className="text-[16px] font-bold text-slate-900">Upload Your ID</h2>
              </div>
              <p className="text-[13px] text-slate-500 leading-relaxed">
                Take a photo of your government-issued ID card. We need the front (required) and back (optional).
              </p>
            </div>

            {/* Front Photo */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4 text-slate-600" />
                  <span className="text-[13px] font-semibold text-slate-800">Front of ID</span>
                  <span className="text-[11px] text-red-500 font-medium">Required</span>
                </div>
              </div>
              <div className="p-4">
                {frontPhoto ? (
                  <div className="relative rounded-xl overflow-hidden border-2 border-emerald-300 aspect-[1.6]">
                    <img src={frontPhoto} alt="Front of ID" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setFrontPhoto(null)}
                      className="absolute top-2 right-2 size-8 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                      <X className="size-4 text-white" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-emerald-600/90 text-white text-[12px] text-center py-1.5 font-medium">
                      <Check className="size-3.5 inline mr-1" />Front captured
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => frontRef.current?.click()}
                    className="w-full aspect-[1.6] rounded-xl border-2 border-dashed border-slate-300 hover:border-emerald-400 flex flex-col items-center justify-center text-slate-400 hover:text-emerald-600 transition-all active:scale-[0.98]"
                  >
                    <Camera className="size-12 mb-2" />
                    <span className="text-[14px] font-semibold">Tap to take photo</span>
                    <span className="text-[11px] mt-0.5">or choose from gallery</span>
                  </button>
                )}
                <input
                  ref={frontRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => { handleCapture('front', e.target.files); e.target.value = ''; }}
                />
              </div>
            </div>

            {/* Back Photo */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4 text-slate-600 rotate-180" />
                  <span className="text-[13px] font-semibold text-slate-800">Back of ID</span>
                  <span className="text-[11px] text-slate-400">Optional</span>
                </div>
              </div>
              <div className="p-4">
                {backPhoto ? (
                  <div className="relative rounded-xl overflow-hidden border-2 border-blue-300 aspect-[1.6]">
                    <img src={backPhoto} alt="Back of ID" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setBackPhoto(null)}
                      className="absolute top-2 right-2 size-8 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                      <X className="size-4 text-white" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-blue-600/90 text-white text-[12px] text-center py-1.5 font-medium">
                      <Check className="size-3.5 inline mr-1" />Back captured
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => backRef.current?.click()}
                    className="w-full aspect-[1.6] rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 transition-all active:scale-[0.98]"
                  >
                    <Camera className="size-10 mb-2" />
                    <span className="text-[13px] font-medium">Tap to add back photo</span>
                    <span className="text-[11px] mt-0.5">May contain additional info</span>
                  </button>
                )}
                <input
                  ref={backRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => { handleCapture('back', e.target.files); e.target.value = ''; }}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!frontPhoto}
              className={`w-full py-4 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                frontPhoto
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Upload className="size-5" />
              Submit ID Photos
              <ChevronRight className="size-4" />
            </button>

            {/* Security notice */}
            <div className="flex items-start gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <Shield className="size-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-emerald-700 leading-relaxed">
                Your photos are encrypted, processed securely, and automatically deleted after verification. This session expires in 5 minutes and can only be used once.
              </p>
            </div>
          </div>
        )}

        {/* ═══ UPLOADING ═══ */}
        {(status === 'uploading' || status === 'processing') && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="size-20 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
              <Loader2 className="size-10 text-emerald-600 animate-spin" />
            </div>
            <p className="text-[16px] font-bold text-slate-800">
              {status === 'uploading' ? 'Uploading…' : 'Processing ID…'}
            </p>
            <p className="text-[13px] text-slate-500 mt-1 text-center max-w-xs">
              {status === 'uploading'
                ? 'Sending your photos securely'
                : 'AI is reading your ID. This takes a few seconds.'}
            </p>
            <div className="mt-4 flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="size-2.5 rounded-full bg-emerald-400 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ═══ SUCCESS ═══ */}
        {status === 'success' && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="size-24 rounded-full bg-emerald-50 flex items-center justify-center mb-5">
              <Check className="size-14 text-emerald-600" />
            </div>
            <h2 className="text-[20px] font-bold text-emerald-800">ID Submitted Successfully!</h2>
            <p className="text-[14px] text-slate-500 mt-2 text-center max-w-xs">
              Your information has been securely processed. The store staff will see your data on their screen now.
            </p>
            <div className="mt-6 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
              <p className="text-[12px] text-slate-600">You can close this page now.</p>
            </div>
          </div>
        )}

        {/* ═══ EXPIRED ═══ */}
        {status === 'expired' && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="size-20 rounded-full bg-amber-50 flex items-center justify-center mb-4">
              <AlertCircle className="size-10 text-amber-500" />
            </div>
            <h2 className="text-[18px] font-bold text-amber-800">Session Expired</h2>
            <p className="text-[13px] text-slate-500 mt-2 text-center max-w-xs">
              This QR code has expired for security reasons. Please ask the store staff to generate a new QR code.
            </p>
          </div>
        )}

        {/* ═══ ALREADY USED ═══ */}
        {status === 'used' && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="size-20 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <Shield className="size-10 text-blue-500" />
            </div>
            <h2 className="text-[18px] font-bold text-blue-800">Session Already Used</h2>
            <p className="text-[13px] text-slate-500 mt-2 text-center max-w-xs">
              This QR code has already been used. Each code can only be used once. Please ask for a new one.
            </p>
          </div>
        )}

        {/* ═══ ERROR ═══ */}
        {status === 'error' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="size-18 rounded-full bg-red-50 flex items-center justify-center mb-4 p-4">
              <AlertCircle className="size-10 text-red-500" />
            </div>
            <h2 className="text-[16px] font-bold text-red-800">Something Went Wrong</h2>
            <p className="text-[12px] text-slate-500 mt-2 text-center max-w-xs">{errorMsg}</p>
            <button
              onClick={handleRetry}
              className="mt-4 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[13px] font-medium flex items-center gap-1.5 transition-colors active:scale-[0.98]"
            >
              <RefreshCw className="size-4" />
              Try Again
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-4 py-3 text-center border-t border-slate-200 bg-white">
        <p className="text-[10px] text-slate-400">
          Paymore POS — Secure ID Verification · Photos are auto-deleted after processing
        </p>
      </footer>
    </div>
  );
}
