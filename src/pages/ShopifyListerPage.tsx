import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import { useShopifyListerStore } from '@/stores/shopifyListerStore';
import { Package, FileEdit, CheckCircle2, Store, AlertCircle, Search, Plug } from 'lucide-react';
import ShopifyPublishDialog from '@/components/features/shopify/ShopifyPublishDialog';
import type { ShopifyListing } from '@/types/shopify';
import { MAX_SHOPIFY_SELECTION } from '@/lib/shopify/constants';
import { evaluateShopifyEligibility, getEligibleInventory, getShopifyDashboardCounts } from '@/lib/shopify/eligibility';
import { matchesEligibleInventorySearch, matchesListingSearch } from '@/lib/shopify/search';
import { selectionCountLabel, toggleInventorySelection } from '@/lib/shopify/selection';
import { checkDuplicateShopifyListing } from '@/lib/shopify/duplicates';
import ShopifyInventoryPicker, { EligibleInventoryActions } from '@/components/features/shopify/ShopifyInventoryPicker';
import ShopifyListingTable from '@/components/features/shopify/ShopifyListingTable';
import type { ShopifyListingStatus } from '@/types/shopify';

export default function ShopifyListerPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { employee, store } = useAuthStore();
  const pos = usePosStore();
  const shopify = useShopifyListerStore();
  const [tab, setTab] = useState('eligible');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pendingPublish, setPendingPublish] = useState<ShopifyListing | null>(null);

  useEffect(() => {
    if (store?.id) void shopify.load(store.id);
  }, [store?.id]);

  const inventoryById = useMemo(() => new Map(pos.inventory.map((i) => [i.id, i])), [pos.inventory]);

  const eligibleItems = useMemo(
    () => getEligibleInventory(pos.inventory, shopify.listings, shopify.holdingPeriodDays),
    [pos.inventory, shopify.listings, shopify.holdingPeriodDays],
  );

  const counts = useMemo(
    () => getShopifyDashboardCounts(shopify.listings, eligibleItems.length),
    [shopify.listings, eligibleItems.length],
  );

  const eligibleRows = useMemo(() => {
    return pos.inventory
      .map((item) => {
        const eligibility = evaluateShopifyEligibility({
          inventory: item,
          listings: shopify.listings,
          holdingPeriodDays: shopify.holdingPeriodDays,
        });
        const purchase = pos.purchaseItems.find((p) => p.id === item.sourcePurchaseItemId);
        return {
          item,
          photo: purchase?.photos?.[0],
          holding: eligibility.holding,
          action: checkDuplicateShopifyListing(shopify.listings, item.id),
          show: eligibility.eligible || eligibility.reason === 'Already listed on Shopify',
        };
      })
      .filter((row) => row.show && matchesEligibleInventorySearch(row.item, search, row.item.specifications?.upcSku as string || ''));
  }, [pos.inventory, pos.purchaseItems, shopify.listings, shopify.holdingPeriodDays, search]);

  const listingsForTab = (status: ShopifyListingStatus | ShopifyListingStatus[]) => {
    const statuses = Array.isArray(status) ? status : [status];
    return shopify.listings
      .filter((l) => statuses.includes(l.status))
      .filter((l) => matchesListingSearch(l, inventoryById.get(l.inventoryItemId), search));
  };

  const handleToggle = (id: string) => {
    const next = toggleInventorySelection(selectedIds, id);
    if (next.error) {
      toast({ variant: 'destructive', title: next.error });
      return;
    }
    setSelectedIds(next.selectedIds);
  };

  const handleCreate = async () => {
    if (!store?.id) return;
    setCreating(true);
    const items = pos.inventory.filter((i) => selectedIds.includes(i.id));
    const result = await shopify.createDrafts({
      storeId: store.id,
      employeeId: employee?.id || null,
      items,
      purchaseItems: pos.purchaseItems,
    });
    setCreating(false);
    setSelectedIds([]);

    result.blocked.forEach((row) => {
      toast({ variant: 'destructive', title: row.item.deviceCode, description: row.message });
    });
    if (result.continued.length) {
      toast({ title: `${result.continued.length} existing draft(s) — continue editing` });
    }
    const first = result.created[0] || result.continued[0];
    if (first) {
      toast({ title: `Created ${result.created.length} Shopify draft(s)` });
      navigate(`/pos/shopify-lister/${first.id}`);
    }
  };

  const cards = [
    { label: 'Eligible Inventory', value: counts.eligible, icon: Package, color: 'text-amber-600 bg-amber-50' },
    { label: 'Draft Listings', value: counts.drafts, icon: FileEdit, color: 'text-sky-600 bg-sky-50' },
    { label: 'Ready to Publish', value: counts.ready, icon: CheckCircle2, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Active on Shopify', value: counts.active, icon: Store, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Errors', value: counts.errors, icon: AlertCircle, color: 'text-red-600 bg-red-50' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Shopify Auto Lister</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Prepare eligible POS inventory for Shopify.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-9" disabled={testing} onClick={async () => {
            setTesting(true);
            const result = await shopify.testConnection({
              storeId: store?.id,
              employeeId: employee?.id,
              employeeName: employee?.fullName,
            });
            setTesting(false);
            toast({
              variant: result.connected ? 'default' : 'destructive',
              title: result.connected ? 'Shopify connected' : 'Shopify not connected',
              description: result.message,
            });
          }}>
            <Plug className="size-3.5 mr-1" />
            {testing ? 'Testing…' : 'Test Shopify Connection'}
          </Button>
          <Button className="h-9" onClick={() => setTab('eligible')}>Select From Inventory</Button>
        </div>
      </div>

      {shopify.connection && (
        <div className={`rounded-md border px-3 py-2 text-[12px] ${shopify.connection.connected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {shopify.connection.message}
          {shopify.connection.shopName ? ` Shop: ${shopify.connection.shopName}.` : ''}
          {shopify.connection.locationName ? ` Location: ${shopify.connection.locationName}.` : ''}
        </div>
      )}

      {shopify.loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          {shopify.loadError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="shadow-none">
              <CardContent className="p-4">
                <div className={`size-8 rounded-md flex items-center justify-center mb-2 ${card.color}`}>
                  <Icon className="size-4" />
                </div>
                <p className="text-[22px] font-bold tabular-nums leading-none">{card.value}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{card.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="eligible">Eligible Inventory</TabsTrigger>
            <TabsTrigger value="drafts">Drafts</TabsTrigger>
            <TabsTrigger value="ready">Ready</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="ended">Ended</TabsTrigger>
          </TabsList>
          <div className="relative w-full lg:w-80">
            <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-[12px]"
              placeholder="Search title, device code, SKU, IMEI…"
            />
          </div>
        </div>

        <TabsContent value="eligible" className="space-y-3 mt-4">
          <EligibleInventoryActions
            selectedCount={selectedIds.length}
            max={MAX_SHOPIFY_SELECTION}
            onCreate={handleCreate}
            busy={creating}
          />
          <p className="text-[11px] text-muted-foreground">{selectionCountLabel(selectedIds.length)}</p>
          <ShopifyInventoryPicker rows={eligibleRows} selectedIds={selectedIds} onToggle={handleToggle} />
        </TabsContent>

        <TabsContent value="drafts" className="mt-4">
          <ShopifyListingTable
            listings={listingsForTab('draft')}
            inventoryById={inventoryById}
            onEdit={(l) => navigate(`/pos/shopify-lister/${l.id}`)}
            onViewInventory={() => navigate('/pos/inventory')}
          />
        </TabsContent>
        <TabsContent value="ready" className="mt-4">
          <ShopifyListingTable
            listings={[...listingsForTab('ready'), ...listingsForTab('publishing')]}
            inventoryById={inventoryById}
            publishingListingId={shopify.publishingListingId}
            onEdit={(l) => navigate(`/pos/shopify-lister/${l.id}`)}
            onViewInventory={() => navigate('/pos/inventory')}
            onRetry={(l) => setPendingPublish(l)}
          />
        </TabsContent>
        <TabsContent value="active" className="mt-4">
          <ShopifyListingTable
            listings={listingsForTab('active')}
            inventoryById={inventoryById}
            publishingListingId={shopify.publishingListingId}
            onEdit={(l) => navigate(`/pos/shopify-lister/${l.id}`)}
            onViewInventory={() => navigate('/pos/inventory')}
          />
        </TabsContent>
        <TabsContent value="errors" className="mt-4">
          <ShopifyListingTable
            listings={listingsForTab('error')}
            inventoryById={inventoryById}
            publishingListingId={shopify.publishingListingId}
            onEdit={(l) => navigate(`/pos/shopify-lister/${l.id}`)}
            onViewInventory={() => navigate('/pos/inventory')}
            onRetry={(l) => setPendingPublish(l)}
          />
        </TabsContent>
        <TabsContent value="ended" className="mt-4">
          <ShopifyListingTable
            listings={listingsForTab(['ended', 'sold'])}
            inventoryById={inventoryById}
            onEdit={(l) => navigate(`/pos/shopify-lister/${l.id}`)}
            onViewInventory={() => navigate('/pos/inventory')}
          />
        </TabsContent>
      </Tabs>

      <ShopifyPublishDialog
        open={Boolean(pendingPublish)}
        listing={pendingPublish}
        onOpenChange={(open) => { if (!open) setPendingPublish(null); }}
        onConfirm={() => {
          if (!pendingPublish || !store?.id || !employee) return;
          const listing = pendingPublish;
          setPendingPublish(null);
          void shopify.publishListing({
            listing,
            storeId: store.id,
            employeeId: employee.id,
            employeeName: employee.fullName,
          }).then((result) => {
            toast({
              variant: result.success ? 'default' : 'destructive',
              title: result.success ? 'Active on Shopify' : 'Publish failed',
              description: result.message,
            });
          });
        }}
      />
    </div>
  );
}
