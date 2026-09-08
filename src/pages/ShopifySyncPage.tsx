import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import { useShopifyListerStore } from '@/stores/shopifyListerStore';
import { db } from '@/lib/database';
import { shopifyCatalogService } from '@/services/shopify';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, ExternalLink, Package, RefreshCw } from 'lucide-react';
import { SHOPIFY_SYNC_REQUIRED } from '@/lib/shopify/saleSync';

export default function ShopifySyncPage() {
  const navigate = useNavigate();
  const { employee, store } = useAuthStore();
  const pos = usePosStore();
  const shopify = useShopifyListerStore();
  const { toast } = useToast();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (store?.id) {
      shopify.load(store.id);
      db.getShopifySyncEvents(store.id).then(setEvents);
    }
  }, [store?.id]);

  const rows = useMemo(() => {
    const inventoryById = new Map(pos.inventory.map((item) => [item.id, item]));
    return shopify.listings
      .filter((listing) => listing.shopifyProductId || listing.status === 'active' || listing.status === 'sold' || listing.syncStatus === 'error' || listing.syncStatus === 'pending')
      .map((listing) => {
        const item = inventoryById.get(listing.inventoryItemId);
        const mismatch = item && listing.status !== 'draft' && listing.shopifyProductId
          ? (item.quantityOnHand || 0) !== (listing.quantity || 0) || listing.syncStatus === 'error' || listing.syncStatus === 'pending'
          : listing.syncStatus === 'error' || listing.syncStatus === 'pending';
        return { listing, item, mismatch };
      })
      .sort((a, b) => Number(b.mismatch) - Number(a.mismatch));
  }, [shopify.listings, pos.inventory]);

  const handleSync = async (inventoryItemId: string) => {
    if (!employee || !store) return;
    setSyncingId(inventoryItemId);
    const result = await shopifyCatalogService.syncInventory({
      inventoryItemId,
      reason: 'SHOPIFY_INVENTORY_SYNC',
      storeId: store.id,
      employeeId: employee.id,
      employeeName: employee.fullName,
    });
    setSyncingId(null);
    await shopify.load(store.id);
    const refreshed = await db.getShopifySyncEvents(store.id);
    setEvents(refreshed);
    if (result.success) {
      toast({ title: 'Shopify inventory synced', description: result.message });
    } else {
      toast({ variant: 'destructive', title: SHOPIFY_SYNC_REQUIRED, description: result.message || result.error });
    }
  };

  const handleRegister = async () => {
    if (!employee || !store) return;
    setRegistering(true);
    const result = await shopifyCatalogService.registerWebhooks({ employeeId: employee.id, storeId: store.id });
    setRegistering(false);
    if (result.success) {
      toast({ title: 'Shopify webhooks registered', description: result.callbackUrl });
    } else {
      toast({ variant: 'destructive', title: 'Webhook registration failed', description: result.error || result.errors?.join('; ') });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Shopify Sync</h1>
          <p className="text-[12px] text-muted-foreground">POS quantity is the source of truth. Failed Shopify updates stay visible here until retried.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRegister} disabled={registering}>
          <RefreshCw className={`size-3.5 mr-1.5 ${registering ? 'animate-spin' : ''}`} />
          Register Webhooks
        </Button>
      </div>

      {rows.some((row) => row.mismatch || row.listing.syncStatus === 'error') && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 flex items-start gap-2">
            <AlertTriangle className="size-4 text-destructive mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-destructive">{SHOPIFY_SYNC_REQUIRED}</p>
              <p className="text-[11px] text-muted-foreground">A POS sale or return completed, but Shopify quantity/status still needs correction.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Device Code</TableHead>
                <TableHead className="text-[11px]">Inventory ID</TableHead>
                <TableHead className="text-[11px] text-right">POS Qty</TableHead>
                <TableHead className="text-[11px] text-right">Shopify Qty</TableHead>
                <TableHead className="text-[11px]">Listing Status</TableHead>
                <TableHead className="text-[11px]">Last Sync</TableHead>
                <TableHead className="text-[11px]">Sync Status</TableHead>
                <TableHead className="text-[11px]">Error</TableHead>
                <TableHead className="text-[11px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-[12px] text-muted-foreground py-8">
                    No Shopify listings found.
                  </TableCell>
                </TableRow>
              ) : rows.map(({ listing, item, mismatch }) => (
                <TableRow key={listing.id} className={mismatch ? 'bg-destructive/5' : undefined}>
                  <TableCell className="font-mono text-[12px]">{item?.deviceCode || '—'}</TableCell>
                  <TableCell className="font-mono text-[11px]">{listing.inventoryItemId}</TableCell>
                  <TableCell className="text-right font-mono text-[12px]">{item?.quantityOnHand ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono text-[12px]">{listing.quantity}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[9px] capitalize">{listing.status}</Badge>
                  </TableCell>
                  <TableCell className="text-[11px] whitespace-nowrap">{listing.lastSyncedAt ? new Date(listing.lastSyncedAt).toLocaleString() : '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[9px] ${listing.syncStatus === 'error' || listing.syncStatus === 'pending' ? 'border-destructive text-destructive' : ''}`}>
                      {listing.syncStatus || 'idle'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[11px] max-w-[220px] truncate text-destructive">{listing.lastSyncError || listing.lastError || '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" className="h-7 text-[10px]" disabled={syncingId === listing.inventoryItemId} onClick={() => handleSync(listing.inventoryItemId)}>
                        Sync Now
                      </Button>
                      {listing.shopifyAdminUrl && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" asChild>
                          <a href={listing.shopifyAdminUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-3 mr-1" />Open Shopify
                          </a>
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => navigate('/pos/inventory')}>
                        <Package className="size-3 mr-1" />View POS Item
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-[13px] font-semibold mb-2">Recent sync events</h2>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">When</TableHead>
                  <TableHead className="text-[11px]">Event</TableHead>
                  <TableHead className="text-[11px]">Direction</TableHead>
                  <TableHead className="text-[11px]">Inventory</TableHead>
                  <TableHead className="text-[11px]">Status</TableHead>
                  <TableHead className="text-[11px]">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.slice(0, 40).map((event) => (
                  <TableRow key={String(event.id)}>
                    <TableCell className="text-[11px] whitespace-nowrap">{event.created_at ? new Date(String(event.created_at)).toLocaleString() : '—'}</TableCell>
                    <TableCell className="font-mono text-[11px]">{String(event.event_type || '')}</TableCell>
                    <TableCell className="text-[11px]">{String(event.direction || '')}</TableCell>
                    <TableCell className="font-mono text-[11px]">{String(event.inventory_item_id || '')}</TableCell>
                    <TableCell className="text-[11px]">{String(event.status || '')}</TableCell>
                    <TableCell className="text-[11px] text-destructive max-w-[280px] truncate">{String(event.error || '—')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
