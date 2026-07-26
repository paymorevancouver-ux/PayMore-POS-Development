import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock } from 'lucide-react';

interface PinPadProps {
  onSubmit: (pin: string) => void;
  error?: string;
  loading?: boolean;
}

export default function PinPad({ onSubmit, error, loading }: PinPadProps) {
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

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[280px]">
      <div className="mb-5">
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
          />
        </div>
        {error && <p className="text-center text-destructive text-[13px] mt-2 font-medium">{error}</p>}
      </div>
      <Button
        type="submit"
        disabled={pin.length < 4 || loading}
        className="w-full h-12 text-[15px] font-semibold"
      >
        {loading ? 'Signing in...' : 'Unlock Terminal'}
      </Button>
    </form>
  );
}
