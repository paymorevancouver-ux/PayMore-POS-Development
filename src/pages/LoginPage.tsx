import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import { STORES } from '@/constants/mockData';
import PinPad from '@/components/features/PinPad';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield } from 'lucide-react';
import heroImg from '@/assets/login-hero.jpg';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { loadStoreData } = usePosStore();
  const [storeId, setStoreId] = useState(STORES[0].id);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (pin: string) => {
    setLoading(true);
    setError('');
    try {
      const emp = await login(pin, storeId);
      if (emp) {
        // Load all store data from database
        await loadStoreData(storeId);
        navigate('/pos/dashboard');
      } else {
        setError('Invalid PIN. Try again.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        <img src={heroImg} alt="Paymore store" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(222,35%,8%)]/90 via-[hsl(222,35%,8%)]/70 to-transparent" />
        <div className="relative z-10 flex flex-col justify-end p-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-12 rounded-xl bg-[hsl(142,64%,36%)] flex items-center justify-center">
              <span className="text-white font-extrabold text-lg">PM</span>
            </div>
            <div>
              <h1 className="text-white text-3xl font-extrabold tracking-tight">PayMore</h1>
              <p className="text-white/60 text-sm">Point of Sale Terminal</p>
            </div>
          </div>
          <p className="text-white/50 text-sm max-w-md leading-relaxed">
            Buy, sell, and trade second-hand electronics. Manage customers, inventory, sales, returns, and cash drawer from one terminal.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8 lg:hidden">
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <div className="size-10 rounded-xl bg-primary flex items-center justify-center">
                <span className="text-white font-extrabold text-sm">PM</span>
              </div>
              <h1 className="text-2xl font-extrabold text-foreground">PayMore</h1>
            </div>
          </div>

          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 text-primary bg-primary/10 px-3 py-1 rounded-full text-xs font-semibold mb-3">
              <Shield className="size-3" />
              Secured Terminal
            </div>
            <h2 className="text-xl font-bold text-foreground">Enter your PIN</h2>
            <p className="text-muted-foreground text-sm mt-1">Select your store and type your employee PIN</p>
            <p className="text-[10px] text-muted-foreground/50 mt-2">Paymore — Production Terminal (Database-backed)</p>
          </div>

          <div className="mb-6">
            <label className="block text-[13px] font-medium text-foreground mb-1.5">Store Location</label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STORES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-center">
            <PinPad onSubmit={handleSubmit} error={error} loading={loading} />
          </div>

          <p className="text-center text-[10px] text-muted-foreground/60 mt-6">
            Sessions auto-lock after inactivity. Contact admin for PIN resets.
          </p>
        </div>
      </div>
    </div>
  );
}
