import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/taxCalc';
import { getInventoryLifecycleLabel } from '@/lib/inventorySearch';
import { checkDuplicateShopifyListing } from '@/lib/shopify/duplicates';
import { evaluateShopifyEligibility } from '@/lib/shopify/eligibility';
import type { InventoryItem, PurchaseItem } from '@/types';
import type { ShopifyListing } from '@/types/shopify';
import type { HoldingPeriodStatus } from '@/lib/holdingPeriod';

export interface EligibleRow {
  item: InventoryItem;
  photo?: string;
  holding: HoldingPeriodStatus;
  action: ReturnType<typeof checkDuplicateShopifyListing>;
}

export function buildEligibleRows(
  inventory: InventoryItem[],
  listings: ShopifyListing[],
  purchaseItems: PurchaseItem[],
  holdingPeriodDays: number,
): EligibleRow[] {
  return inventory.map((item) => {
    const eligibility = evaluateShopifyEligibility({ inventory: item, listings, holdingPeriodDays });
    const purchase = purchaseItems.find((p) => p.id === item.sourcePurchaseItemId);
    return {
      item,
      photo: purchase?.photos?.[0],
      holding: eligibility.holding,
      action: checkDuplicateShopifyListing(listings, item.id),
    };
  }).filter((row) => evaluateShopifyEligibility({
    inventory: row.item,
    listings,
    holdingPeriodDays,
  }).eligible);
}

export default function ShopifyInventoryPicker({
  rows,
  selectedIds,
  onToggle,
}: {
  rows: EligibleRow[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-[12px] text-muted-foreground py-8 text-center">No eligible inventory found.</p>;
  }

  return (
    <div className="rounded-lg border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>Photo</TableHead>
            <TableHead>Device Code</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Brand / Model</TableHead>
            <TableHead>Serial / IMEI</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Cost</TableHead>
            <TableHead>Expected</TableHead>
            <TableHead>Acquired</TableHead>
            <TableHead>Holding</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ item, photo, holding, action }) => {
            const blocked = action.action === 'already-listed';
            const selected = selectedIds.includes(item.id);
            return (
              <TableRow key={item.id} className={selected ? 'bg-primary/5' : undefined}>
                <TableCell>
                  {blocked ? (
                    <Badge variant="outline" className="text-[9px]">Listed</Badge>
                  ) : action.action === 'continue-draft' ? (
                    <Badge variant="outline" className="text-[9px]">Draft</Badge>
                  ) : (
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggle(item.id)}
                      className="size-4 accent-primary"
                    />
                  )}
                </TableCell>
                <TableCell>
                  {photo ? (
                    <img src={photo} alt="" className="size-10 rounded object-cover border" />
                  ) : (
                    <div className="size-10 rounded bg-muted" />
                  )}
                </TableCell>
                <TableCell className="font-mono text-[11px]">{item.deviceCode}</TableCell>
                <TableCell className="text-[11px]">{item.category}</TableCell>
                <TableCell className="text-[11px] font-medium">{item.brand} {item.model}</TableCell>
                <TableCell className="font-mono text-[10px]">{item.serialImei || '—'}</TableCell>
                <TableCell className="text-[11px]">{item.quantityOnHand}</TableCell>
                <TableCell className="text-[11px]">{formatCurrency(item.costPerUnit)}</TableCell>
                <TableCell className="text-[11px]">{formatCurrency(item.expectedSalePrice)}</TableCell>
                <TableCell className="text-[11px]">{formatDate(item.acquiredAt)}</TableCell>
                <TableCell className="text-[10px]">{holding.label}</TableCell>
                <TableCell className="text-[10px]">{getInventoryLifecycleLabel(item.status)}</TableCell>
                <TableCell className="text-[10px]">
                  {[item.storageRack, item.storageRow, item.storageLocation].filter(Boolean).join(' / ') || '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function EligibleInventoryActions({
  selectedCount,
  max,
  onCreate,
  busy,
}: {
  selectedCount: number;
  max: number;
  onCreate: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[12px] font-medium tabular-nums">{selectedCount} / {max} selected</p>
      <Button className="h-9" disabled={selectedCount === 0 || busy} onClick={onCreate}>
        Create Shopify Drafts
      </Button>
    </div>
  );
}
