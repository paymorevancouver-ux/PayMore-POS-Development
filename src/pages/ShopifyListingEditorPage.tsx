import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import { useShopifyListerStore } from '@/stores/shopifyListerStore';
import { DEVICE_CONDITIONS } from '@/constants/config';
import { PRODUCT_SPEC_CATEGORIES, getSpecCategory } from '@/config/productSpecifications';
import { formatCurrency, formatDate } from '@/lib/taxCalc';
import { generateShopifyTitle } from '@/lib/shopify/titleGenerator';
import { generateShopifyDescription } from '@/lib/shopify/descriptionGenerator';
import { generateShopifyTags } from '@/lib/shopify/tagGenerator';
import { canPublishListing } from '@/lib/shopify/publish';
import ShopifySpecForm from '@/components/features/shopify/ShopifySpecForm';
import ShopifyAccessoriesEditor from '@/components/features/shopify/ShopifyAccessoriesEditor';
import ShopifyTestingControls from '@/components/features/shopify/ShopifyTestingControls';
import ShopifyPhotoManager from '@/components/features/shopify/ShopifyPhotoManager';
import ShopifyPublishDialog from '@/components/features/shopify/ShopifyPublishDialog';
import type { ShopifyListing } from '@/types/shopify';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function ShopifyListingEditorPage() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { store, employee } = useAuthStore();
  const pos = usePosStore();
  const shopify = useShopifyListerStore();
  const [draft, setDraft] = useState<ShopifyListing | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [issues, setIssues] = useState<Array<{ field: string; message: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [errorDetails, setErrorDetails] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const draftRef = useRef<ShopifyListing | null>(null);

  useEffect(() => {
    if (store?.id && shopify.listings.length === 0 && !shopify.isLoading) {
      void shopify.load(store.id);
    }
  }, [store?.id]);

  useEffect(() => {
    const found = shopify.listings.find((l) => l.id === listingId) || null;
    setDraft(found);
    draftRef.current = found;
  }, [listingId, shopify.listings]);

  const inventory = pos.inventory.find((i) => i.id === draft?.inventoryItemId);
  const category = useMemo(
    () => getSpecCategory(draft?.attributes?.categoryId as string || inventory?.category || draft?.shopifyProductType || '', inventory?.brand || draft?.shopifyVendor || ''),
    [draft, inventory],
  );

  const persist = async (next: ShopifyListing, updates: Partial<ShopifyListing>) => {
    setSaving(true);
    const saved = await shopify.saveListing(next, updates);
    setSaving(false);
    if (!saved) {
      toast({ variant: 'destructive', title: 'Could not save draft' });
      return;
    }
    setDraft(saved);
    draftRef.current = saved;
  };

  const scheduleSave = (updates: Partial<ShopifyListing>) => {
    if (!draft || draft.status === 'publishing' || draft.status === 'active') return;
    const next = { ...draft, ...updates };
    setDraft(next);
    draftRef.current = next;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(next, updates);
    }, 800);
  };

  const saveNow = async () => {
    if (!draft) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    await persist(draft, draft);
    toast({ title: 'Draft saved' });
  };

  const regenerateTitle = () => {
    if (!draft || !inventory) return;
    const title = generateShopifyTitle({
      categoryKey: category.key,
      brand: inventory.brand,
      model: inventory.model,
      attributes: draft.attributes,
    });
    scheduleSave({ title });
  };

  const regenerateDescription = () => {
    if (!draft || !inventory) return;
    const description = generateShopifyDescription({
      categoryKey: category.key,
      brand: inventory.brand,
      model: inventory.model,
      condition: String(draft.condition || ''),
      attributes: draft.attributes,
      accessories: draft.accessories,
      testingResults: draft.testingResults,
    });
    scheduleSave({ description });
  };

  const regenerateTags = () => {
    if (!draft || !inventory) return;
    scheduleSave({
      tags: generateShopifyTags({
        categoryKey: category.key,
        brand: inventory.brand,
        model: inventory.model,
        condition: String(draft.condition || ''),
        attributes: draft.attributes,
      }),
    });
  };

  const markReady = async () => {
    if (!draft) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const current = draftRef.current || draft;
    const result = await shopify.markReady(current, inventory?.category);
    setIssues(result.issues);
    if (result.issues.length) {
      toast({ variant: 'destructive', title: 'Listing is not ready', description: result.issues[0].message });
      return;
    }
    if (result.listing) {
      setDraft(result.listing);
      toast({ title: 'Marked ready to publish' });
    }
  };

  const locked = draft?.status === 'publishing' || shopify.publishingListingId === draft?.id;
  const readOnly = locked || draft?.status === 'active';
  const publishGate = draft
    ? canPublishListing(draft, {
      anyOtherPublishing: Boolean(shopify.publishingListingId && shopify.publishingListingId !== draft.id)
        || shopify.listings.some((row) => row.id !== draft.id && row.status === 'publishing'),
    })
    : { allowed: false, reason: 'Listing not loaded.' };

  const runPublish = async () => {
    if (!draft || !store?.id || !employee) return;
    setConfirmPublish(false);
    const result = await shopify.publishListing({
      listing: draft,
      storeId: store.id,
      employeeId: employee.id,
      employeeName: employee.fullName,
    });
    pos.logAction(employee.id, employee.fullName, 'shopify-lister', result.success ? 'SHOPIFY_PUBLISH_SUCCESS' : 'SHOPIFY_PUBLISH_FAILED', 'shopify_listing', draft.id, result.message);
    if (result.success) {
      toast({ title: 'Active on Shopify', description: result.message });
    } else {
      toast({ variant: 'destructive', title: 'Publish failed', description: result.message });
    }
  };

  if (shopify.isLoading && !draft) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" /> Loading draft…
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Draft not found.</p>
        <Button variant="outline" onClick={() => navigate('/pos/shopify-lister')}>Back to Shopify Auto Lister</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8" onClick={() => navigate('/pos/shopify-lister')}>
            <ArrowLeft className="size-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-[16px] font-bold">Shopify Listing Draft</h1>
            <p className="text-[11px] text-muted-foreground">
              {saving ? 'Saving…' : shopify.lastSavedAt ? `Saved ${new Date(shopify.lastSavedAt).toLocaleTimeString()}` : 'Edits autosave to Supabase'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9" disabled={readOnly} onClick={() => void saveNow()}>Save Draft</Button>
          <Button className="h-9" disabled={readOnly} onClick={() => void markReady()}>Mark Ready</Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    className="h-9"
                    disabled={!publishGate.allowed || locked}
                    onClick={() => setConfirmPublish(true)}
                  >
                    {locked ? 'Publishing…' : draft.status === 'error' ? 'Retry Publish' : 'Publish to Shopify'}
                  </Button>
                </span>
              </TooltipTrigger>
              {!publishGate.allowed && publishGate.reason && (
                <TooltipContent>{publishGate.reason}</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {locked && (
        <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-[12px] text-indigo-800">
          Publishing to Shopify...
        </div>
      )}

      {draft.status === 'active' && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] space-y-2">
          <p className="font-semibold text-emerald-800">Active on Shopify</p>
          <div className="flex gap-3">
            {draft.photos[0] ? (
              <img src={draft.photos[0]} alt="" className="size-14 rounded object-cover border" />
            ) : (
              <div className="size-14 rounded bg-muted" />
            )}
            <div className="space-y-0.5">
              <p className="font-medium">{draft.title}</p>
              <p>Device Code: <span className="font-mono">{inventory?.deviceCode || draft.sku || '—'}</span></p>
              <p>Price: {formatCurrency(draft.price)} · Qty: {draft.quantity}</p>
              <p>Published: {draft.publishedAt ? formatDate(draft.publishedAt) : '—'}</p>
              <p>Shopify Product ID: <span className="font-mono">{draft.shopifyProductId || '—'}</span></p>
            </div>
          </div>
          <div className="flex gap-2">
            {(draft.shopifyAdminUrl || draft.shopifyUrl) && (
              <Button size="sm" className="h-7 text-[10px]" asChild>
                <a href={draft.shopifyAdminUrl || draft.shopifyUrl || undefined} target="_blank" rel="noreferrer">Open Shopify</a>
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => navigate('/pos/inventory')}>
              View POS Inventory
            </Button>
          </div>
        </div>
      )}

      {draft.status === 'error' && draft.lastError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-[12px] font-semibold text-destructive">Publish error</p>
          <p className="text-[11px] text-destructive mt-1">{errorDetails ? draft.lastError : draft.lastError.slice(0, 160)}</p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setErrorDetails((v) => !v)}>
              {errorDetails ? 'Hide Details' : 'View Details'}
            </Button>
            <Button size="sm" className="h-7 text-[10px]" disabled={locked} onClick={() => setConfirmPublish(true)}>Retry Publish</Button>
          </div>
        </div>
      )}

      <ShopifyPublishDialog
        open={confirmPublish}
        listing={draft}
        onOpenChange={setConfirmPublish}
        onConfirm={() => void runPublish()}
      />

      {issues.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-[12px] font-semibold text-destructive mb-1">Required before Ready</p>
          <ul className="text-[11px] text-destructive space-y-0.5">
            {issues.map((issue) => <li key={issue.field}>• {issue.message}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="space-y-3">
          <fieldset disabled={readOnly} className="space-y-2 disabled:opacity-80">
          <Accordion type="multiple" defaultValue={['basic', 'specs', 'shopify']} className="space-y-2">
            <AccordionItem value="basic" className="border rounded-lg px-3 bg-card">
              <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Basic Information</AccordionTrigger>
              <AccordionContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3">
                <div>
                  <Label className="text-[11px]">Vendor</Label>
                  <Input value={draft.shopifyVendor} onChange={(e) => scheduleSave({ shopifyVendor: e.target.value })} className="mt-1 h-8 text-[12px]" />
                </div>
                <div>
                  <Label className="text-[11px]">Product Type</Label>
                  <Select
                    value={category.key}
                    onValueChange={(key) => {
                      const next = PRODUCT_SPEC_CATEGORIES.find((c) => c.key === key);
                      scheduleSave({
                        shopifyProductType: next?.productType || key,
                        attributes: { ...draft.attributes, categoryId: key },
                      });
                    }}
                  >
                    <SelectTrigger className="mt-1 h-8 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRODUCT_SPEC_CATEGORIES.map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Condition</Label>
                  <Select value={String(draft.condition || '')} onValueChange={(v) => scheduleSave({ condition: v })}>
                    <SelectTrigger className="mt-1 h-8 text-[12px]"><SelectValue placeholder="Select condition" /></SelectTrigger>
                    <SelectContent>
                      {DEVICE_CONDITIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Price</Label>
                  <Input type="number" value={draft.price} onChange={(e) => scheduleSave({ price: Number(e.target.value) })} className="mt-1 h-8 text-[12px] font-mono" />
                </div>
                <div>
                  <Label className="text-[11px]">Compare-at Price</Label>
                  <Input
                    type="number"
                    value={draft.compareAtPrice ?? ''}
                    onChange={(e) => scheduleSave({ compareAtPrice: e.target.value === '' ? null : Number(e.target.value) })}
                    className="mt-1 h-8 text-[12px] font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">Quantity</Label>
                  <Input type="number" min={1} value={draft.quantity} onChange={(e) => scheduleSave({ quantity: Number(e.target.value) })} className="mt-1 h-8 text-[12px]" />
                </div>
                <div>
                  <Label className="text-[11px]">SKU</Label>
                  <Input value={draft.sku} onChange={(e) => scheduleSave({ sku: e.target.value })} className="mt-1 h-8 text-[12px] font-mono" />
                </div>
                <div>
                  <Label className="text-[11px]">Barcode</Label>
                  <Input value={draft.barcode} onChange={(e) => scheduleSave({ barcode: e.target.value })} className="mt-1 h-8 text-[12px] font-mono" />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="specs" className="border rounded-lg px-3 bg-card">
              <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Specifications</AccordionTrigger>
              <AccordionContent className="pb-3">
                <ShopifySpecForm
                  category={category}
                  attributes={draft.attributes}
                  onChange={(attributes) => scheduleSave({ attributes })}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="testing" className="border rounded-lg px-3 bg-card">
              <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Condition & Testing</AccordionTrigger>
              <AccordionContent className="pb-3">
                <ShopifyTestingControls
                  tests={category.tests}
                  results={draft.testingResults}
                  onChange={(testingResults) => scheduleSave({ testingResults })}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="accessories" className="border rounded-lg px-3 bg-card">
              <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Included Accessories</AccordionTrigger>
              <AccordionContent className="pb-3">
                <ShopifyAccessoriesEditor
                  accessories={draft.accessories}
                  onChange={(accessories) => scheduleSave({ accessories })}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="photos" className="border rounded-lg px-3 bg-card">
              <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Photos</AccordionTrigger>
              <AccordionContent className="pb-3">
                <ShopifyPhotoManager photos={draft.photos} onChange={(photos) => scheduleSave({ photos })} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="shopify" className="border rounded-lg px-3 bg-card">
              <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Shopify Listing</AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px]">Title</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={regenerateTitle}>
                      Regenerate Suggested Title
                    </Button>
                  </div>
                  <Input value={draft.title} onChange={(e) => scheduleSave({ title: e.target.value })} className="mt-1 h-8 text-[12px]" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px]">Description</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={regenerateDescription}>
                      Regenerate Description
                    </Button>
                  </div>
                  <Textarea value={draft.description} onChange={(e) => scheduleSave({ description: e.target.value })} className="mt-1 text-[12px] min-h-[220px]" />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px]">Tags</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={regenerateTags}>
                      Suggest Tags
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {draft.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="text-[10px] px-2 py-0.5 rounded-full border bg-secondary"
                        onClick={() => scheduleSave({ tags: draft.tags.filter((t) => t !== tag) })}
                      >
                        {tag} ×
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} className="h-8 text-[12px]" placeholder="Add tag" />
                    <Button type="button" variant="outline" className="h-8 text-[11px]" onClick={() => {
                      const tag = tagInput.trim();
                      if (!tag || draft.tags.includes(tag)) return;
                      scheduleSave({ tags: [...draft.tags, tag] });
                      setTagInput('');
                    }}>Add</Button>
                  </div>
                </div>
                <div>
                  <Label className="text-[11px]">Staff notes (internal only)</Label>
                  <Textarea value={draft.staffNotes} onChange={(e) => scheduleSave({ staffNotes: e.target.value })} className="mt-1 text-[12px] min-h-[72px]" />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          </fieldset>
        </div>

        <Card className="h-fit xl:sticky xl:top-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px]">Inventory Reference</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[12px]">
            {inventory ? (
              <>
                <RefRow label="Device Code" value={inventory.deviceCode} />
                <RefRow label="Original Category" value={inventory.category} />
                <RefRow label="Brand" value={inventory.brand} />
                <RefRow label="Model" value={inventory.model} />
                <RefRow label="Serial / IMEI" value={inventory.serialImei || '—'} />
                <RefRow label="Cost" value={formatCurrency(inventory.costPerUnit)} />
                <RefRow label="Expected Price" value={formatCurrency(inventory.expectedSalePrice)} />
                <RefRow label="Storage Location" value={[inventory.storageRack, inventory.storageRow, inventory.storageLocation].filter(Boolean).join(' / ') || '—'} />
                <RefRow label="Acquired Date" value={formatDate(inventory.acquiredAt)} />
                <p className="text-[10px] text-muted-foreground pt-2">
                  These values come from POS inventory and do not need to be re-entered.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Inventory item not loaded.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RefRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-medium break-all">{value}</p>
    </div>
  );
}
