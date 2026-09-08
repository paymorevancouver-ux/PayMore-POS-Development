import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/taxCalc';
import { getInventoryLifecycleLabel } from '@/lib/inventorySearch';
import { MAX_SHOPIFY_SELECTION } from '@/lib/shopify/constants';
import { matchesEligibleInventorySearch } from '@/lib/shopify/search';
import { toggleInventorySelection } from '@/lib/shopify/selection';
import { evaluateShopifyEligibility } from '@/lib/shopify/eligibility';
import { checkDuplicateShopifyListing } from '@/lib/shopify/duplicates';
import type { CustomerVisit, InventoryItem, PurchaseItem, PurchaseTransaction } from '@/types';
import type { ShopifyListing } from '@/types/shopify';

export default function ShopifyInventorySelector({
  open,
  onOpenChange,
  inventory,
  listings,
  purchaseItems,
  purchases,
  visits,
  holdingPeriodDays,
  onOpen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventory: InventoryItem[];
  listings: ShopifyListing[];
  purchaseItems: PurchaseItem[];
  purchases: PurchaseTransaction[];
  visits: CustomerVisit[];
  holdingPeriodDays: number;
  onOpen: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [condition, setCondition] = useState('');
  const [sortBy, setSortBy] = useState('acquired');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const purchaseByItem = useMemo(() => new Map(purchaseItems.map((p) => [p.id, p])), [purchaseItems]);
  const visitById = useMemo(() => new Map(visits.map((v) => [v.id, v])), [visits]);

  const rows = useMemo(() => {
    const filtered = inventory.filter((item) => {
      const eligibility = evaluateShopifyEligibility({ inventory: item, listings, holdingPeriodDays });
      if (!eligibility.eligible) return false;
      const purchase = item.sourcePurchaseItemId ? purchaseByItem.get(item.sourcePurchaseItemId) : undefined;
      const visit = item.visitId ? visitById.get(item.visitId) : undefined;
      const extra = [purchase?.purchaseTransactionId, visit?.visitCode, item.specifications?.upcSku as string || ''].filter(Boolean).join(' ');
      if (!matchesEligibleInventorySearch(item, search, extra)) return false;
      if (category && item.category !== category) return false;
      if (brand && item.brand !== brand) return false;
      if (model && item.model !== model) return false;
      if (condition && purchase?.condition !== condition) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sortBy === 'price') return (b.expectedSalePrice || 0) - (a.expectedSalePrice || 0);
      if (sortBy === 'brand') return `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
      return String(b.acquiredAt).localeCompare(String(a.acquiredAt));
    });
  }, [inventory, listings, holdingPeriodDays, search, category, brand, model, condition, sortBy, purchaseByItem, visitById]);

  const categories = [...new Set(inventory.map((i) => i.category).filter(Boolean))];
  const brands = [...new Set(inventory.map((i) => i.brand).filter(Boolean))];
  const models = [...new Set(inventory.map((i) => i.model).filter(Boolean))];
  const conditions = [...new Set(purchaseItems.map((p) => p.condition).filter(Boolean))];

  const toggle = (id: string) => {
    const next = toggleInventorySelection(selectedIds, id);
    setError(next.error || '');
    setSelectedIds(next.selectedIds);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>Select From Inventory</DialogTitle>
        </DialogHeader>
        <div className="px-5 space-y-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search device code, purchase #, brand, model, serial, IMEI, SKU…" className="h-9 text-[12px]" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <FilterSelect label="Category" value={category} options={categories} onChange={setCategory} />
            <FilterSelect label="Brand" value={brand} options={brands} onChange={setBrand} />
            <FilterSelect label="Model" value={model} options={models} onChange={setModel} />
            <FilterSelect label="Condition" value={condition} options={conditions} onChange={setCondition} />
            <FilterSelect
              label="Sort By"
              value={sortBy}
              options={['acquired', 'price', 'brand']}
              labels={{ acquired: 'Newest acquired', price: 'Highest price', brand: 'Brand / model' }}
              onChange={setSortBy}
              allowAll={false}
            />
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
        <div className="flex-1 overflow-auto px-5 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((item) => {
            const purchase = item.sourcePurchaseItemId ? purchaseByItem.get(item.sourcePurchaseItemId) : undefined;
            const visit = item.visitId ? visitById.get(item.visitId) : undefined;
            const selected = selectedIds.includes(item.id);
            const dup = checkDuplicateShopifyListing(listings, item.id);
            const blocked = dup.action === 'already-listed';
            return (
              <button
                key={item.id}
                type="button"
                disabled={blocked}
                onClick={() => toggle(item.id)}
                className={`text-left rounded-lg border p-3 ${selected ? 'border-primary bg-primary/5' : 'border-border'} ${blocked ? 'opacity-60' : ''}`}
              >
                <div className="flex gap-3">
                  <input type="checkbox" checked={selected} readOnly disabled={blocked} className="mt-1 accent-primary" />
                  <div className="min-w-0 flex-1 text-[11px] space-y-0.5">
                    <p className="text-[13px] font-semibold truncate">{item.brand} {item.model}</p>
                    <p className="font-mono">{item.deviceCode}</p>
                    <p>Purchase: {visit?.visitCode || purchase?.purchaseTransactionId || '—'}</p>
                    <p>Status: {getInventoryLifecycleLabel(item.status)} · Qty {item.quantityOnHand}</p>
                    <p>Expected {formatCurrency(item.expectedSalePrice)} · Listing {formatCurrency(listings.find((l) => l.inventoryItemId === item.id)?.price || item.expectedSalePrice)}</p>
                    <p>Qty {item.quantityOnHand} · Location {[item.storageRack, item.storageRow, item.storageLocation].filter(Boolean).join(' / ') || '—'}</p>
                    <p>{item.category} · {item.brand} {item.model} · {purchase?.condition || '—'}</p>
                    <p>SKU {item.deviceCode} · Barcode {String(item.specifications?.upcSku || '—')}</p>
                    <p>Included: {(item.specifications?.accessories || []).filter((a) => a.included).map((a) => a.note || a.id).join(', ') || 'Device'}</p>
                    <p>Internal SN/IMEI: {item.serialImei || '—'}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-t bg-background px-5 py-3 flex items-center justify-between gap-3">
          <p className="text-[12px] font-medium">{selectedIds.length} Products Selected · {selectedIds.length} / {MAX_SHOPIFY_SELECTION} Tabs</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={selectedIds.length === 0}
              onClick={() => {
                onOpen(selectedIds);
                setSelectedIds([]);
                onOpenChange(false);
              }}
            >
              Open in Autolister
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  labels,
  allowAll = true,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  labels?: Record<string, string>;
  allowAll?: boolean;
}) {
  return (
    <label className="text-[10px] text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-[11px] text-foreground">
        {allowAll && <option value="">All</option>}
        {options.map((opt) => <option key={opt} value={opt}>{labels?.[opt] || opt}</option>)}
      </select>
    </label>
  );
}
