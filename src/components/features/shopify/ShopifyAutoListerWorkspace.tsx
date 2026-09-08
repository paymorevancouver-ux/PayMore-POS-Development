import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import { useShopifyListerStore } from '@/stores/shopifyListerStore';
import { getSpecCategory } from '@/config/productSpecifications';
import { formatDate } from '@/lib/taxCalc';
import { canPublishListing, canFinalizeShopifyLabel } from '@/lib/shopify/publish';
import { generateShopifyTitle } from '@/lib/shopify/titleGenerator';
import { generateShopifyTags } from '@/lib/shopify/tagGenerator';
import { regenerateDescription } from '@/lib/shopify/descriptionSync';
import { getListerMeta } from '@/lib/shopify/listerMeta';
import { suggestFunctionalityFromTests } from '@/lib/shopify/conditionPhrases';
import { applyDraftUpdates } from '@/lib/shopify/prefill';
import {
  mergeStaleAutosaveCategory,
  omitCategoryFields,
  pickShopifyCategoryFields,
  SHOPIFY_CATEGORY_SAVE_FAILED,
  verifyPersistedShopifyCategory,
  type ShopifyCategoryFields,
} from '@/lib/shopify/categoryPersistence';
import ShopifyInventorySelector from '@/components/features/shopify/ShopifyInventorySelector';
import ShopifyProductTabs from '@/components/features/shopify/ShopifyProductTabs';
import ShopifyListingForm from '@/components/features/shopify/ShopifyListingForm';
import ShopifyDescriptionPreview from '@/components/features/shopify/ShopifyDescriptionPreview';
import ShopifyPublishDialog from '@/components/features/shopify/ShopifyPublishDialog';
import ShopifyPublishSuccessDialog from '@/components/features/shopify/ShopifyPublishSuccessDialog';
import ShopifyListingTable from '@/components/features/shopify/ShopifyListingTable';
import BarcodeLabelDialog from '@/components/features/BarcodeLabelDialog';
import { canPrintShopifyListingLabel } from '@/lib/shopify/retailBarcode';
import { Plug, Store } from 'lucide-react';
import type { ShopifyListing } from '@/types/shopify';
import type { InventoryItem } from '@/types';

export default function ShopifyAutoListerWorkspace({ initialListingId }: { initialListingId?: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { store, employee } = useAuthStore();
  const pos = usePosStore();
  const shopify = useShopifyListerStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showListings, setShowListings] = useState(false);
  const [testing, setTesting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [issues, setIssues] = useState<Array<{ field: string; message: string }>>([]);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [successListing, setSuccessListing] = useState<ShopifyListing | null>(null);
  const [labelItem, setLabelItem] = useState<InventoryItem | null>(null);
  const [localDrafts, setLocalDrafts] = useState<Record<string, ShopifyListing>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [categorySavingId, setCategorySavingId] = useState<string | null>(null);
  const [categorySaveErrorId, setCategorySaveErrorId] = useState<string | null>(null);
  const [categorySaveError, setCategorySaveError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const draftsRef = useRef(localDrafts);
  const saveSeq = useRef(0);
  const persistChain = useRef(Promise.resolve<ShopifyListing | null>(null));
  draftsRef.current = localDrafts;

  useEffect(() => {
    if (store?.id) void shopify.load(store.id);
  }, [store?.id]);

  useEffect(() => {
    if (initialListingId) shopify.openTabs([initialListingId], initialListingId);
  }, [initialListingId]);

  const inventoryById = useMemo(() => new Map(pos.inventory.map((i) => [i.id, i])), [pos.inventory]);
  const openListings = shopify.openListingIds
    .map((id) => localDrafts[id] || shopify.listings.find((l) => l.id === id))
    .filter((row): row is ShopifyListing => Boolean(row));
  const active = openListings.find((l) => l.id === shopify.activeListingId) || openListings[0] || null;
  const inventory = active ? inventoryById.get(active.inventoryItemId) : undefined;
  const category = getSpecCategory(
    String(active?.attributes?.categoryId || inventory?.category || active?.shopifyProductType || ''),
    inventory?.brand || active?.shopifyVendor || '',
  );

  const persist = async (listing: ShopifyListing, updates: Partial<ShopifyListing> = {}) => {
    const seq = ++saveSeq.current;
    const run = async () => {
      const latest = draftsRef.current[listing.id] || listing;
      const categorySafeUpdates = omitCategoryFields(updates);
      const merged = applyDraftUpdates(latest, categorySafeUpdates);
      const saved = await shopify.saveListing(merged, omitCategoryFields(merged));
      if (!saved) {
        toast({ variant: 'destructive', title: 'Could not save draft' });
        return null;
      }
      const newest = draftsRef.current[listing.id];
      const next = {
        ...mergeStaleAutosaveCategory(saved, newest),
        ...pickShopifyCategoryFields(newest || saved),
      };
      if (seq !== saveSeq.current && newest) {
        return { ...newest, ...pickShopifyCategoryFields(newest) };
      }
      setLocalDrafts((s) => ({ ...s, [next.id]: { ...s[next.id], ...next, ...pickShopifyCategoryFields(s[next.id] || newest || next) } }));
      setDirtyIds((s) => {
        const ids = new Set(s);
        ids.delete(next.id);
        return ids;
      });
      return next;
    };
    const pending = persistChain.current.then(run, run);
    persistChain.current = pending.then(() => null);
    return pending;
  };

  const persistCategory = async (fields: ShopifyCategoryFields, extra: Partial<ShopifyListing> = {}) => {
    if (!active || active.status === 'publishing' || active.status === 'active') return null;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const current = draftsRef.current[active.id] || active;
    const selected = applyDraftUpdates(current, {
      ...omitCategoryFields(extra),
      ...fields,
      shopifyCategoryConfirmed: false,
    });
    draftsRef.current = { ...draftsRef.current, [selected.id]: selected };
    setLocalDrafts(draftsRef.current);
    setDirtyIds((s) => new Set(s).add(selected.id));
    setCategorySavingId(selected.id);
    setCategorySaveErrorId(null);
    setCategorySaveError(null);
    const result = await shopify.saveShopifyCategory(selected, fields);
    const latest = draftsRef.current[selected.id] || selected;
    const failed = applyDraftUpdates(latest, {
      ...(fields.shopifyCategoryId ? pickShopifyCategoryFields(fields) : pickShopifyCategoryFields(current)),
      shopifyCategoryConfirmed: false,
    });
    if (!result.listing || result.error) {
      draftsRef.current = { ...draftsRef.current, [failed.id]: failed };
      setLocalDrafts(draftsRef.current);
      setCategorySavingId(null);
      setCategorySaveErrorId(failed.id);
      setCategorySaveError(SHOPIFY_CATEGORY_SAVE_FAILED);
      toast({ variant: 'destructive', title: SHOPIFY_CATEGORY_SAVE_FAILED });
      return null;
    }
    const persisted = pickShopifyCategoryFields(result.listing);
    if (fields.shopifyCategoryConfirmed && !verifyPersistedShopifyCategory({ id: String(fields.shopifyCategoryId || '') }, persisted)) {
      draftsRef.current = { ...draftsRef.current, [failed.id]: failed };
      setLocalDrafts(draftsRef.current);
      setCategorySavingId(null);
      setCategorySaveErrorId(failed.id);
      setCategorySaveError(SHOPIFY_CATEGORY_SAVE_FAILED);
      toast({ variant: 'destructive', title: SHOPIFY_CATEGORY_SAVE_FAILED });
      return null;
    }
    const next = applyDraftUpdates(latest, persisted);
    draftsRef.current = { ...draftsRef.current, [next.id]: next };
    setLocalDrafts(draftsRef.current);
    setCategorySavingId(null);
    setCategorySaveErrorId(null);
    setCategorySaveError(null);
    setDirtyIds((s) => {
      const ids = new Set(s);
      ids.delete(next.id);
      return ids;
    });
    return next;
  };

  const scheduleSave = (updates: Partial<ShopifyListing>) => {
    if (!active || active.status === 'publishing' || active.status === 'active') return;
    const current = draftsRef.current[active.id] || active;
    const meta = getListerMeta(current);
    const nextUpdates = omitCategoryFields({ ...updates });
    if (updates.extraTitleText !== undefined && meta.titleMode !== 'manual') {
      nextUpdates.title = generateShopifyTitle({
        categoryKey: category.key,
        brand: inventory?.brand || current.shopifyVendor,
        model: inventory?.model || '',
        attributes: updates.attributes || current.attributes,
        extraTitleText: updates.extraTitleText,
      });
    }
    if (updates.testingResults && !meta.functionalityConditionKey && !updates.functionalityConditionKey) {
      const suggested = suggestFunctionalityFromTests(category.tests, updates.testingResults, '');
      if (suggested === 'FULLY_FUNCTIONAL') nextUpdates.functionalityConditionKey = suggested;
    }
    const next = applyDraftUpdates(current, nextUpdates);
    draftsRef.current = { ...draftsRef.current, [next.id]: next };
    setLocalDrafts(draftsRef.current);
    setDirtyIds((s) => new Set(s).add(next.id));
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const listingId = next.id;
    saveTimer.current = window.setTimeout(() => {
      const latest = draftsRef.current[listingId];
      if (latest) void persist(latest, omitCategoryFields(latest));
    }, 800);
  };

  const closeTab = (id: string) => {
    if (dirtyIds.has(id) && !window.confirm('This tab has unsaved listing changes. Close and discard the unsaved edits? The POS inventory item will not be deleted.')) {
      return;
    }
    shopify.closeTab(id);
    setLocalDrafts((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  };

  const locked = active?.status === 'publishing' || shopify.publishingListingId === active?.id;
  const readOnly = Boolean(locked || active?.status === 'active');
  const publishGate = active
    ? canPublishListing(active, {
      anyOtherPublishing: Boolean(shopify.publishingListingId && shopify.publishingListingId !== active.id)
        || shopify.listings.some((row) => row.id !== active.id && row.status === 'publishing'),
    })
    : { allowed: false };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">MultiTab Autolister</h1>
          <p className="text-[13px] text-muted-foreground">Select products from inventory, complete the listing, then publish.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9" disabled={testing} onClick={async () => {
            setTesting(true);
            const result = await shopify.testConnection({ storeId: store?.id, employeeId: employee?.id, employeeName: employee?.fullName });
            setTesting(false);
            toast({ variant: result.connected ? 'default' : 'destructive', title: result.connected ? 'Shopify connected' : 'Shopify not connected', description: result.message });
          }}>
            <Plug className="size-3.5 mr-1" /> {testing ? 'Testing…' : 'Test Shopify Connection'}
          </Button>
          <Button className="h-9" onClick={() => setPickerOpen(true)}>Select From Inventory</Button>
          <Button variant="outline" className="h-9" disabled title="Non-inventory listing will be added later.">Add Non Inventory Item</Button>
          <Button variant="outline" className="h-9" onClick={() => setShowListings((v) => !v)}>
            <Store className="size-3.5 mr-1" /> {showListings ? 'Hide Listings' : 'View Listings'}
          </Button>
        </div>
      </div>

      {shopify.connection && (
        <div className={`rounded-md border px-3 py-2 text-[12px] ${shopify.connection.connected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {shopify.connection.message}
        </div>
      )}
      {shopify.loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{shopify.loadError}</div>
      )}

      <ShopifyInventorySelector
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        inventory={pos.inventory}
        listings={shopify.listings}
        purchaseItems={pos.purchaseItems}
        purchases={pos.purchases}
        visits={pos.visits}
        holdingPeriodDays={shopify.holdingPeriodDays}
        onOpen={async (ids) => {
          if (!store?.id) return;
          setCreating(true);
          const items = pos.inventory.filter((i) => ids.includes(i.id));
          const result = await shopify.createDrafts({
            storeId: store.id,
            employeeId: employee?.id || null,
            items,
            purchaseItems: pos.purchaseItems,
          });
          setCreating(false);
          result.blocked.forEach((row) => toast({ variant: 'destructive', title: row.item.deviceCode, description: row.message }));
          if (result.created.length || result.continued.length) {
            toast({ title: `Opened ${result.created.length + result.continued.length} listing tab(s)` });
          }
        }}
      />

      {openListings.length === 0 && !showListings ? (
        <div className="rounded-lg border min-h-[420px] flex flex-col items-center justify-center text-center px-6">
          <h2 className="text-2xl font-bold">MultiTab Autolister</h2>
          <p className="text-[13px] text-muted-foreground mt-2">Select products from inventory to begin.</p>
          <Button className="mt-5" onClick={() => setPickerOpen(true)} disabled={creating}>Select Products to Begin</Button>
        </div>
      ) : null}

      {openListings.length > 0 && active && (
        <>
          <ShopifyProductTabs
            listings={openListings}
            inventoryById={inventoryById}
            activeId={active.id}
            onSelect={(id) => shopify.setActiveTab(id)}
            onClose={closeTab}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {shopify.lastSavedAt ? `Saved ${new Date(shopify.lastSavedAt).toLocaleTimeString()}` : 'Edits autosave'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-8 text-[11px]" disabled={readOnly} onClick={() => void persist(active, active)}>Save Draft</Button>
              <Button className="h-8 text-[11px]" disabled={readOnly} onClick={async () => {
                if (saveTimer.current) window.clearTimeout(saveTimer.current);
                const current = draftsRef.current[active.id] || active;
                const saved = await persist(current, current);
                if (!saved) return;
                const result = await shopify.markReady(saved, inventory?.category);
                setIssues(result.issues);
                if (result.issues.length) {
                  toast({ variant: 'destructive', title: 'Listing is not ready', description: result.issues.map((issue) => issue.message).join(' ') });
                  return;
                }
                if (result.listing) {
                  setLocalDrafts((s) => ({ ...s, [result.listing!.id]: result.listing! }));
                  toast({ title: 'Marked ready to publish' });
                }
              }}>Mark Ready</Button>
              <Button className="h-8 text-[11px]" disabled={!publishGate.allowed || locked} onClick={() => setConfirmPublish(true)}>
                {locked ? 'Publishing…' : active.status === 'error' ? 'Retry Publish' : 'Publish to Shopify'}
              </Button>
            </div>
          </div>
          {locked && <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-[12px] text-indigo-800">Publishing to Shopify...</div>}
          {active.status === 'active' && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px]">
              Active on Shopify · {active.publishedAt ? formatDate(active.publishedAt) : ''} · {active.shopifyProductId}
            </div>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,45%)_minmax(0,55%)] gap-4 items-start">
            <ShopifyListingForm
              draft={active}
              inventory={inventory}
              category={category}
              readOnly={readOnly}
              issues={issues}
              storeId={store?.id}
              employeeId={employee?.id}
              categorySaving={categorySavingId === active.id}
              categorySaveError={categorySaveErrorId === active.id ? categorySaveError : null}
              onChange={scheduleSave}
              onPersistCategory={(fields, extra) => { void persistCategory(fields, extra); }}
              onRegenerateTitle={() => scheduleSave({
                title: generateShopifyTitle({
                  categoryKey: category.key,
                  brand: inventory?.brand || active.shopifyVendor,
                  model: inventory?.model || '',
                  attributes: active.attributes,
                  extraTitleText: getListerMeta(active).extraTitleText,
                }),
                titleMode: 'generated',
              })}
              onRegenerateDescription={() => {
                const next = regenerateDescription(active);
                setLocalDrafts((s) => ({ ...s, [next.id]: next }));
                void persist(active, next);
              }}
              onRegenerateTags={() => scheduleSave({
                tags: generateShopifyTags({
                  categoryKey: category.key,
                  brand: inventory?.brand || active.shopifyVendor,
                  model: inventory?.model || '',
                  condition: String(active.condition || ''),
                  attributes: active.attributes,
                }),
              })}
              onGenerateBarcode={() => {
                if (!employee) return;
                void shopify.generateListingBarcode({
                  listing: active,
                  inventory,
                  employeeId: employee.id,
                  employeeName: employee.fullName,
                }).then((result) => {
                  if (result.error) {
                    toast({ variant: 'destructive', title: 'Barcode was not generated', description: result.error });
                    return;
                  }
                  if (result.listing) setLocalDrafts((s) => ({ ...s, [result.listing!.id]: result.listing! }));
                  toast({ title: 'Barcode saved to POS', description: result.barcode });
                });
              }}
            />
            <ShopifyDescriptionPreview listing={active} />
          </div>
        </>
      )}

      {showListings && (
        <div className="space-y-3">
          <h2 className="text-[14px] font-semibold">Existing listings</h2>
          <ShopifyListingTable
            listings={shopify.listings}
            inventoryById={inventoryById}
            publishingListingId={shopify.publishingListingId}
            onEdit={(listing) => shopify.openTabs([listing.id], listing.id)}
            onViewInventory={() => navigate('/pos/inventory')}
            onRetry={(listing) => {
              shopify.openTabs([listing.id], listing.id);
              setConfirmPublish(true);
            }}
          />
        </div>
      )}

      <ShopifyPublishDialog
        open={confirmPublish}
        listing={active}
        onOpenChange={setConfirmPublish}
        onConfirm={() => {
          if (!active || !store?.id || !employee) return;
          setConfirmPublish(false);
          if (saveTimer.current) window.clearTimeout(saveTimer.current);
          const current = draftsRef.current[active.id] || active;
          void persist(current, current).then((saved) => {
            if (!saved) return Promise.resolve(null);
            return shopify.publishListing({
              listing: saved,
              storeId: store.id,
              employeeId: employee.id,
              employeeName: employee.fullName,
            });
          }).then((result) => {
            if (!result) return;
            if (result.success) {
              const latest = useShopifyListerStore.getState().listings.find((row) => row.id === current.id);
              const published = latest || {
                ...current,
                status: 'active' as const,
                barcode: result.barcode || current.barcode,
                shopifyProductId: result.shopifyProductId || current.shopifyProductId,
                shopifyAdminUrl: result.shopifyAdminUrl || current.shopifyAdminUrl,
                shopifyUrl: result.shopifyAdminUrl || result.shopifyUrl || current.shopifyUrl,
              };
              if (result.barcode) {
                pos.updateInventoryItem(current.inventoryItemId, { barcode: result.barcode });
              }
              setSuccessListing({ ...published, barcode: result.barcode || published.barcode });
              const item = pos.inventory.find((row) => row.id === current.inventoryItemId);
              if (item && !item.labelGenerated && canFinalizeShopifyLabel(result)) {
                void pos.generateInventoryLabel(item.id, employee.id, employee.fullName);
              }
            }
            toast({
              variant: result.success ? 'default' : 'destructive',
              title: result.success ? 'Active on Shopify' : 'Publish failed',
              description: result.message,
            });
          });
        }}
      />
      <ShopifyPublishSuccessDialog
        open={Boolean(successListing)}
        listing={successListing}
        barcode={successListing?.barcode}
        onOpenChange={(open) => { if (!open) setSuccessListing(null); }}
        onOpenShopify={() => {
          const url = successListing?.shopifyAdminUrl || successListing?.shopifyUrl;
          if (url) window.open(url, '_blank', 'noopener');
        }}
        onPrintLabel={() => {
          if (!successListing || !employee || !canPrintShopifyListingLabel(successListing)) return;
          const item = pos.inventory.find((row) => row.id === successListing.inventoryItemId);
          if (!item) return;
          pos.logAction(
            employee.id,
            employee.fullName,
            'shopify-lister',
            'LABEL_PRINT_REQUESTED',
            'inventory',
            item.id,
            `barcode=${successListing.barcode} device=${successListing.sku} product=${successListing.shopifyProductId || ''}`,
          );
          setLabelItem({ ...item, barcode: successListing.barcode || item.barcode });
          setSuccessListing(null);
        }}
        onDone={() => setSuccessListing(null)}
      />
      <BarcodeLabelDialog
        open={Boolean(labelItem)}
        item={labelItem}
        onOpenChange={(open) => { if (!open) setLabelItem(null); }}
      />
    </div>
  );
}
