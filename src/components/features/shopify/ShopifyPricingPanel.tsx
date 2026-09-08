import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/taxCalc';
import { formatMargin, listingProfit } from '@/lib/shopify/pricing';
import type { InventoryItem } from '@/types';
import type { ShopifyListing } from '@/types/shopify';

export default function ShopifyPricingPanel({
  draft,
  inventory,
  readOnly,
  onChange,
}: {
  draft: ShopifyListing;
  inventory?: InventoryItem;
  readOnly?: boolean;
  onChange: (updates: Partial<ShopifyListing>) => void;
}) {
  const cost = Number(inventory?.costPerUnit || 0);
  const { profit, margin } = listingProfit(draft.price, cost);

  return (
    <div className="rounded-lg border bg-card px-3 py-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px]">Price</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={draft.price}
            onChange={(e) => onChange({ price: Number(e.target.value) })}
            className="mt-1 h-8 text-[12px] font-mono"
            disabled={readOnly}
          />
          <p className="text-[11px] font-mono mt-1">{formatCurrency(Number(draft.price) || 0)}</p>
        </div>
        <div>
          <Label className="text-[11px]">Quantity</Label>
          <Input
            type="number"
            min={1}
            value={draft.quantity}
            onChange={(e) => onChange({ quantity: Number(e.target.value) })}
            className="mt-1 h-8 text-[12px]"
            disabled={readOnly}
          />
        </div>
        <div className="sm:col-span-2">
          <p className="text-[11px] font-semibold">Additional display prices</p>
          <Label className="text-[11px] mt-2 block">Compare-at price</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={draft.compareAtPrice ?? ''}
            onChange={(e) => onChange({ compareAtPrice: e.target.value === '' ? null : Number(e.target.value) })}
            className="mt-1 h-8 text-[12px] font-mono"
            disabled={readOnly}
            placeholder="Optional"
          />
        </div>
        <label className="flex items-center gap-2 text-[11px] sm:col-span-2">
          <input type="checkbox" checked readOnly disabled />
          Charge tax on this product
        </label>
      </div>
      <div className="border-t pt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Cost</p>
          <p className="font-mono font-semibold">{inventory ? formatCurrency(cost) : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Profit</p>
          <p className={`font-mono font-semibold ${profit >= 0 ? 'text-emerald-700' : 'text-destructive'}`}>{formatCurrency(profit)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Margin</p>
          <p className="font-mono font-semibold">{formatMargin(margin)}</p>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">Cost comes from POS inventory and is not published to the storefront.</p>
    </div>
  );
}
