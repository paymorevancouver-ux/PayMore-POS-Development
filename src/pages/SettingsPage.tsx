import { useState } from 'react';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Settings, RefreshCw, Key, Shield, Clock, Store, Database, Loader2 } from 'lucide-react';
import { STORES } from '@/constants/mockData';
import { supabase } from '@/lib/supabase';
import { useEffect } from 'react';
import { db } from '@/lib/database';
import { HOLDING_PERIOD_SETTING_KEY, parseHoldingPeriodDays } from '@/lib/holdingPeriod';
import { useShopifyListerStore } from '@/stores/shopifyListerStore';

export default function SettingsPage() {
  const { employee, store, changeOwnPin, sessionTimeoutMinutes, setSessionTimeout } = useAuthStore();
  const pos = usePosStore();
  const { toast } = useToast();

  const [showPinChange, setShowPinChange] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [timeoutValue, setTimeoutValue] = useState(String(sessionTimeoutMinutes));
  const [holdingDays, setHoldingDays] = useState('0');
  const [storeDataCounts, setStoreDataCounts] = useState<Record<string, Record<string, number>>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);

  useEffect(() => {
    loadStoreDataCounts();
    if (store?.id) {
      void db.getSetting(store.id, HOLDING_PERIOD_SETTING_KEY).then((value) => {
        setHoldingDays(String(parseHoldingPeriodDays(value)));
      });
    }
  }, [store?.id]);

  const loadStoreDataCounts = async () => {
    setLoadingCounts(true);
    const tables = [
      'pos_customers', 'pos_employees', 'pos_visits', 'pos_purchases',
      'pos_inventory', 'pos_shopify_listings', 'pos_sales', 'pos_returns', 'pos_cash_drawer_entries',
      'pos_audit_log'
    ];
    const counts: Record<string, Record<string, number>> = {};
    for (const s of STORES) {
      counts[s.id] = {};
      for (const table of tables) {
        const { count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('store_id', s.id);
        const label = table.replace('pos_', '').replace(/_/g, ' ');
        counts[s.id][label] = count || 0;
      }
    }
    setStoreDataCounts(counts);
    setLoadingCounts(false);
  };

  const handlePinChange = () => {
    if (newPin.length < 4) {
      toast({ variant: 'destructive', title: 'New PIN must be at least 4 digits' });
      return;
    }
    if (newPin !== confirmPin) {
      toast({ variant: 'destructive', title: 'PINs do not match' });
      return;
    }
    const success = changeOwnPin(oldPin, newPin);
    if (!success) {
      toast({ variant: 'destructive', title: 'Current PIN is incorrect' });
      return;
    }
    setShowPinChange(false);
    setOldPin('');
    setNewPin('');
    setConfirmPin('');
    toast({ title: 'PIN changed successfully' });
  };

  const handleTimeoutSave = () => {
    const mins = parseInt(timeoutValue);
    if (isNaN(mins) || mins < 5 || mins > 480) {
      toast({ variant: 'destructive', title: 'Timeout must be between 5 and 480 minutes' });
      return;
    }
    setSessionTimeout(mins);
    toast({ title: `Session timeout set to ${mins} minutes` });
  };

  const handleHoldingSave = async () => {
    const days = parseHoldingPeriodDays(holdingDays);
    if (!store?.id) return;
    if (days < 0 || days > 365) {
      toast({ variant: 'destructive', title: 'Holding period must be between 0 and 365 days' });
      return;
    }
    await db.setSetting(store.id, HOLDING_PERIOD_SETTING_KEY, String(days));
    setHoldingDays(String(days));
    useShopifyListerStore.setState({ holdingPeriodDays: days });
    toast({ title: `Holding period set to ${days} day${days === 1 ? '' : 's'}` });
  };

  const handleReset = () => {
    pos.resetAll();
    toast({ title: 'Data reset', description: 'All data restored to defaults.' });
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-2">
        <Settings className="size-5 text-primary" />
        <h1 className="text-lg font-bold">Settings</h1>
      </div>

      {/* Current User */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <CardTitle className="text-[14px]">Your Account</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-[11px] font-bold text-primary">
                  {employee?.fullName.split(' ').map((n) => n[0]).join('')}
                </span>
              </div>
              <div>
                <p className="text-[13px] font-semibold">{employee?.fullName}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                  <span>{employee?.email}</span>
                  <span>·</span>
                  <span className="font-mono">{employee?.id}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[9px] capitalize">{employee?.role}</Badge>
              <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => setShowPinChange(true)}>
                <Key className="size-3 mr-1" />Change PIN
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session Settings */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <CardTitle className="text-[14px]">Session Security</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium">Auto-Logout Timeout</p>
              <p className="text-[11px] text-muted-foreground">Automatically locks the terminal after inactivity</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={timeoutValue}
                onChange={(e) => setTimeoutValue(e.target.value)}
                className="w-20 h-8 text-[11px] font-mono text-right"
                min={5}
                max={480}
              />
              <span className="text-[11px] text-muted-foreground">min</span>
              <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={handleTimeoutSave}>
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <CardTitle className="text-[14px]">Inventory Holding Period</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium">Days before listing</p>
              <p className="text-[11px] text-muted-foreground">Used by Shopify Auto Lister. Stored as pos_settings.holding_period_days.</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={holdingDays}
                onChange={(e) => setHoldingDays(e.target.value)}
                className="w-20 h-8 text-[11px] font-mono text-right"
                min={0}
                max={365}
              />
              <span className="text-[11px] text-muted-foreground">days</span>
              <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => void handleHoldingSave()}>
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Store info */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Store className="size-4 text-primary" />
            <CardTitle className="text-[14px]">Store Information</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {STORES.map((s) => (
              <div key={s.id} className={`p-3 rounded-lg border ${s.id === store?.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[13px] font-semibold">{s.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{s.id}</span>
                    {s.id === store?.id && <Badge className="text-[9px]">Current</Badge>}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">{s.address}</p>
                <div className="flex gap-4 mt-1 text-[10px] text-muted-foreground">
                  <span>Tel: {s.phone}</span>
                  <span>GST: {s.gstNumber}</span>
                  <span>PST: {s.pstNumber}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Store Data Summary */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-primary" />
              <CardTitle className="text-[14px]">Store Data Summary</CardTitle>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={loadStoreDataCounts} disabled={loadingCounts}>
              {loadingCounts ? <Loader2 className="size-3 mr-1 animate-spin" /> : <RefreshCw className="size-3 mr-1" />}
              Refresh
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Record counts for PayMore Vancouver (STR-001) in the database.</p>
        </CardHeader>
        <CardContent>
          {loadingCounts ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-[12px]">Loading data counts...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {STORES.map((s) => (
                <div key={s.id} className={`rounded-lg border p-3 ${s.id === store?.id ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12px] font-bold">{s.name}</p>
                    <span className="text-[9px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{s.id}</span>
                  </div>
                  <div className="space-y-1">
                    {storeDataCounts[s.id] && Object.entries(storeDataCounts[s.id]).map(([table, count]) => (
                      <div key={table} className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground capitalize">{table}</span>
                        <span className="font-mono font-semibold tabular-nums">{count}</span>
                      </div>
                    ))}
                    {!storeDataCounts[s.id] && (
                      <p className="text-[11px] text-muted-foreground">No data loaded</p>
                    )}
                  </div>
                  <div className="mt-2 pt-2 border-t border-border">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold">Total Records</span>
                      <span className="font-mono font-bold tabular-nums text-primary">
                        {storeDataCounts[s.id] ? Object.values(storeDataCounts[s.id]).reduce((a, b) => a + b, 0) : 0}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[14px]">System</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium">Reset All Data</p>
              <p className="text-[11px] text-muted-foreground">Restore all data to demo defaults. This cannot be undone.</p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleReset}><RefreshCw className="size-3.5 mr-1.5" />Reset to Production Defaults</Button>
          </div>
        </CardContent>
      </Card>

      {/* PIN Change Dialog */}
      <Dialog open={showPinChange} onOpenChange={setShowPinChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Change Your PIN</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-[11px]">Current PIN</Label>
              <Input type="password" value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1 h-9 text-[12px] font-mono" placeholder="••••" maxLength={6} />
            </div>
            <div>
              <Label className="text-[11px]">New PIN (4-6 digits)</Label>
              <Input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1 h-9 text-[12px] font-mono" placeholder="••••" maxLength={6} />
            </div>
            <div>
              <Label className="text-[11px]">Confirm New PIN</Label>
              <Input type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1 h-9 text-[12px] font-mono" placeholder="••••" maxLength={6} />
            </div>
          </div>
          <Button onClick={handlePinChange} className="mt-3 w-full h-10">Change PIN</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
