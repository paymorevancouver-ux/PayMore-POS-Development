import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ShopifyAccessory } from '@/types/shopify';

export default function ShopifyAccessoriesEditor({
  accessories,
  onChange,
}: {
  accessories: ShopifyAccessory[];
  onChange: (next: ShopifyAccessory[]) => void;
}) {
  const [custom, setCustom] = useState('');

  const toggle = (id: string, included: boolean) => {
    onChange(accessories.map((a) => (a.id === id ? { ...a, included } : a)));
  };

  const addCustom = () => {
    const label = custom.trim();
    if (!label) return;
    const id = `custom-${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`;
    onChange([...accessories, { id, label, included: true, custom: true }]);
    setCustom('');
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {accessories.map((item) => (
          <div key={item.id} className="rounded-md border border-transparent data-[orphan=true]:border-amber-200 data-[orphan=true]:bg-amber-50 px-1.5 py-1" data-orphan={item.orphan === true}>
            <label className="flex items-center gap-2 text-[12px] cursor-pointer py-0.5">
              <Checkbox checked={item.included} onCheckedChange={(v) => toggle(item.id, v === true)} />
              <span>{item.label}</span>
              {item.included && (
                <Input
                  type="number"
                  min={1}
                  value={item.quantity || 1}
                  onChange={(e) => onChange(accessories.map((a) => (
                    a.id === item.id ? { ...a, quantity: Math.max(1, Number(e.target.value) || 1) } : a
                  )))}
                  className="h-7 w-14 text-[11px] ml-auto"
                />
              )}
              {item.custom && !item.orphan && (
                <button
                  type="button"
                  className="ml-auto text-[10px] text-destructive"
                  onClick={() => onChange(accessories.filter((a) => a.id !== item.id))}
                >
                  Remove
                </button>
              )}
            </label>
            {item.orphan && (
              <div className="pl-6 pb-1">
                <p className="text-[10px] text-amber-800">This included item does not normally belong to the selected category.</p>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    className="text-[10px] underline"
                    onClick={() => onChange(accessories.map((a) => (a.id === item.id ? { ...a, orphan: false } : a)))}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    className="text-[10px] text-destructive underline"
                    onClick={() => onChange(accessories.filter((a) => a.id !== item.id))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div>
        <Label className="text-[11px]">Add custom included item</Label>
        <div className="flex gap-2 mt-1">
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} className="h-8 text-[12px]" placeholder='e.g. 2 x 4TB HDD' />
          <Button type="button" variant="outline" className="h-8 text-[11px]" onClick={addCustom}>Add</Button>
        </div>
      </div>
    </div>
  );
}
