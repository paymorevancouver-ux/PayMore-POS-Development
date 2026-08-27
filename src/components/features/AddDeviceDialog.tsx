import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, Plus } from 'lucide-react';
import DevicePhotoCapture from '@/components/features/DevicePhotoCapture';
import DeviceIntakeFields from '@/components/features/DeviceIntakeFields';
import { DEVICE_CONDITIONS } from '@/constants/config';
import {
  DEVICE_CATEGORIES,
  DEVICE_CATEGORY_GROUPS,
  getDeviceCategory,
} from '@/lib/deviceCategories';
import { emptySpecifications, generateListingTitle, hasFindMyOn } from '@/lib/deviceSpecs';
import type { DeviceCondition, DeviceSpecifications } from '@/types';

export interface DeviceIntakeValue {
  category: string;
  brand: string;
  model: string;
  serialImei: string;
  quantity: number;
  buyPrice: number;
  estimatedPrice: number;
  isDeal: boolean;
  conditionNotes: string;
  condition: DeviceCondition;
  inscription: string;
  photos: string[];
  specifications: DeviceSpecifications;
  listingTitle: string;
}

export const emptyDeviceIntake = (): DeviceIntakeValue => ({
  category: 'Windows Laptop',
  brand: '',
  model: '',
  serialImei: '',
  quantity: 1,
  buyPrice: 0,
  estimatedPrice: 0,
  isDeal: true,
  conditionNotes: '',
  condition: 'good',
  inscription: '',
  photos: [],
  specifications: emptySpecifications('windows-laptop'),
  listingTitle: '',
});

interface AddDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: DeviceIntakeValue) => void;
  initial?: DeviceIntakeValue;
}

export default function AddDeviceDialog({ open, onOpenChange, onSave, initial }: AddDeviceDialogProps) {
  const [form, setForm] = useState<DeviceIntakeValue>(initial || emptyDeviceIntake());
  const [titleLocked, setTitleLocked] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial || emptyDeviceIntake());
      setTitleLocked(false);
    }
  }, [open, initial]);

  const categoryDef = getDeviceCategory(form.category) || DEVICE_CATEGORIES[0];

  const generatedTitle = useMemo(
    () => generateListingTitle({
      category: form.category,
      brand: form.brand,
      model: form.model,
      specifications: form.specifications,
    }),
    [form.category, form.brand, form.model, form.specifications],
  );

  useEffect(() => {
    if (!titleLocked) {
      setForm((prev) => (prev.listingTitle === generatedTitle ? prev : { ...prev, listingTitle: generatedTitle }));
    }
  }, [generatedTitle, titleLocked]);

  const changeCategory = (label: string) => {
    const def = getDeviceCategory(label);
    const prevDef = getDeviceCategory(form.category);
    const brand = def?.defaultBrand
      || (prevDef?.defaultBrand && form.brand === prevDef.defaultBrand ? '' : form.brand);
    setTitleLocked(false);
    setForm({
      ...form,
      category: label,
      brand,
      specifications: emptySpecifications(def?.id),
      listingTitle: '',
    });
  };

  const handleSpecs = (specifications: DeviceSpecifications) => {
    const brandPreset = specifications.brandPreset;
    const next = { ...form, specifications };
    if (typeof brandPreset === 'string' && brandPreset && brandPreset !== 'Other') {
      next.brand = brandPreset;
    }
    const systemBrand = (specifications as Record<string, unknown>).systemBrand;
    if (typeof systemBrand === 'string' && systemBrand && systemBrand !== 'Other' && systemBrand !== 'Custom') {
      next.brand = systemBrand;
    }
    if (typeof specifications.macModel === 'string' && specifications.macModel && !form.model) {
      next.model = specifications.macModel;
    }
    setForm(next);
  };

  const canSave = Boolean(form.brand.trim() && form.model.trim() && form.estimatedPrice > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1120px] max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b shrink-0">
          <DialogTitle>Add Device — What is the customer selling?</DialogTitle>
          <p className="text-[11px] text-muted-foreground">Category describes the device type. Brand and model identify the exact product.</p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-4">
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Basic Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-[11px] font-medium">Device Category *</Label>
                    <Select value={form.category} onValueChange={changeCategory}>
                      <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-80">
                        {DEVICE_CATEGORY_GROUPS.map((group) => (
                          <div key={group}>
                            <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">{group}</p>
                            {DEVICE_CATEGORIES.filter((c) => c.group === group).map((c) => (
                              <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Brand *</Label>
                    <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="e.g. ASUS" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Model *</Label>
                    <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="mt-1 h-9 text-[12px]" placeholder="e.g. ROG Zephyrus G14" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">{categoryDef.serialLabel}{categoryDef.id === 'apple-iphone' ? ' *' : ''}</Label>
                    <Input value={form.serialImei} onChange={(e) => setForm({ ...form, serialImei: e.target.value })} className="mt-1 h-9 text-[12px] font-mono" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Quantity</Label>
                    <div className="flex items-center gap-1 mt-1">
                      <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setForm({ ...form, quantity: Math.max(1, form.quantity - 1) })}>-</Button>
                      <Input type="number" value={form.quantity} min={1}
                        onChange={(e) => setForm({ ...form, quantity: Math.max(1, Number(e.target.value)) })}
                        className="h-9 text-center text-[12px] font-mono w-16" />
                      <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setForm({ ...form, quantity: form.quantity + 1 })}>+</Button>
                    </div>
                  </div>
                </div>
              </div>

              {hasFindMyOn(form.specifications) && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                  <AlertCircle className="size-4 text-amber-700 mt-0.5 shrink-0" />
                  <p className="text-[12px] text-amber-900 font-medium">Find My iPhone is ON. Do not complete this purchase until it is turned off.</p>
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Specifications</p>
                <DeviceIntakeFields category={categoryDef} specs={form.specifications} onChange={handleSpecs} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Condition & Pricing</p>
                <div>
                  <Label className="text-[11px] font-medium">Overall Condition *</Label>
                  <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v as DeviceCondition })}>
                    <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEVICE_CONDITIONS.filter((c) => c.value !== 'mint' && c.value !== 'poor').map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3 p-3 bg-secondary/50 rounded-lg">
                  <div>
                    <Label className="text-[11px] font-medium text-primary">Offer Price ($) *</Label>
                    <p className="text-[9px] text-muted-foreground mb-1">What we pay the customer</p>
                    <Input type="number" value={form.buyPrice || ''} step="0.01"
                      onChange={(e) => setForm({ ...form, buyPrice: Number(e.target.value) })}
                      className="h-10 text-[14px] font-mono font-semibold border-primary/30" />
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium">Estimated Sell Price ($) *</Label>
                    <p className="text-[9px] text-muted-foreground mb-1">Expected resale value</p>
                    <Input type="number" value={form.estimatedPrice || ''} step="0.01"
                      onChange={(e) => setForm({ ...form, estimatedPrice: Number(e.target.value) })}
                      className="h-10 text-[14px] font-mono" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isDeal}
                    onChange={(e) => setForm({ ...form, isDeal: e.target.checked })} className="rounded" />
                  <span className="text-[12px] font-medium">Deal — Accept & add to inventory</span>
                </label>
                {!form.isDeal && <Badge variant="secondary" className="text-[9px]">No Deal — Will not be inventoried</Badge>}
              </div>

              <div className="rounded-lg border border-border bg-card p-3">
                <DevicePhotoCapture photos={form.photos} onChange={(photos) => setForm({ ...form, photos })} />
              </div>

              <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div>
                  <Label className="text-[11px] font-medium">Inscription</Label>
                  <Input value={form.inscription} onChange={(e) => setForm({ ...form, inscription: e.target.value })}
                    className="mt-1 h-9 text-[12px]" placeholder="Any inscription or engraving…" />
                </div>
                <div>
                  <Label className="text-[11px] font-medium">Staff Notes / Condition Details</Label>
                  <Textarea value={form.conditionNotes} onChange={(e) => setForm({ ...form, conditionNotes: e.target.value })}
                    className="mt-1 text-[12px] min-h-[64px]" placeholder="Anything not captured above…" />
                </div>
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                <Label className="text-[11px] font-medium">Inventory Title Preview</Label>
                <Input
                  value={form.listingTitle}
                  onChange={(e) => { setTitleLocked(true); setForm({ ...form, listingTitle: e.target.value }); }}
                  className="h-9 text-[12px]"
                />
                <p className="text-[10px] text-muted-foreground">Generated from the specs. Edit before saving if needed.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t flex gap-2 shrink-0 bg-background">
          <Button onClick={() => onSave(form)} className="flex-1 h-10 text-[13px]" disabled={!canSave}>
            <Plus className="size-4 mr-1.5" />Add Device
          </Button>
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
