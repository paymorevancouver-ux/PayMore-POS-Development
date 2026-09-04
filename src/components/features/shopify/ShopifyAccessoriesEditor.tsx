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
          <label key={item.id} className="flex items-center gap-2 text-[12px] cursor-pointer py-0.5">
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
          </label>
        ))}
      </div>
      <div>
        <Label className="text-[11px]">Add custom accessory</Label>
        <div className="flex gap-2 mt-1">
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} className="h-8 text-[12px]" placeholder="e.g. Extra battery" />
          <Button type="button" variant="outline" className="h-8 text-[11px]" onClick={addCustom}>Add</Button>
        </div>
      </div>
    </div>
  );
}
