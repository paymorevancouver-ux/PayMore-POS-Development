import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Delete, Lock } from 'lucide-react';

interface PinPadProps {
  onSubmit: (pin: string) => void;
  error?: string;
  loading?: boolean;
  submitLabel?: string;
  showKeypad?: boolean;
}

export default function PinPad({
  onSubmit,
  error,
  loading,
  submitLabel = 'Unlock Terminal',
  showKeypad = false,
}: PinPadProps) {
  const [pin, setPin] = useState('');

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (pin.length >= 4) {
      onSubmit(pin);
      setPin('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const pressDigit = (digit: string) => {
    setPin((p) => (p + digit).replace(/\D/g, '').slice(0, 6));
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[280px]">
      <div className="mb-4">
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={handleKeyDown}
            className="pl-10 h-12 text-center text-lg font-mono tracking-[0.3em] border-2"
            placeholder="Enter PIN"
            autoFocus
            maxLength={6}
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        {error && <p className="text-center text-destructive text-[13px] mt-2 font-medium">{error}</p>}
      </div>

      {showKeypad && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <Button key={d} type="button" variant="outline" className="h-11 text-[16px] font-semibold font-mono" onClick={() => pressDigit(d)}>
              {d}
            </Button>
          ))}
          <Button type="button" variant="outline" className="h-11" onClick={() => setPin('')} aria-label="Clear PIN">
            C
          </Button>
          <Button type="button" variant="outline" className="h-11 text-[16px] font-semibold font-mono" onClick={() => pressDigit('0')}>
            0
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Backspace">
            <Delete className="size-4" />
          </Button>
        </div>
      )}

      <Button
        type="submit"
        disabled={pin.length < 4 || loading}
        className="w-full h-12 text-[15px] font-semibold"
      >
        {loading ? 'Verifying...' : submitLabel}
      </Button>
    </form>
  );
}
