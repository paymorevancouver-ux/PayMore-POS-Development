import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRODUCT_SPEC_CATEGORIES, getSpecCategory, type SpecCategoryDefinition } from '@/config/productSpecifications';
import {
  COSMETIC_CONDITION_OPTIONS,
  FUNCTIONALITY_CONDITION_OPTIONS,
  RECOMMENDED_SHOPIFY_TITLE_LENGTH,
} from '@/config/shopifyConditionPhrases';
import { buildCosmeticPhrase, buildFunctionalityPhrase, getCosmeticOption, getFunctionalityOption } from '@/lib/shopify/conditionPhrases';
import { getListerMeta } from '@/lib/shopify/listerMeta';
import ShopifySpecForm from '@/components/features/shopify/ShopifySpecForm';
import ShopifyAccessoriesEditor from '@/components/features/shopify/ShopifyAccessoriesEditor';
import ShopifyTestingControls from '@/components/features/shopify/ShopifyTestingControls';
import ShopifyPhotoManager from '@/components/features/shopify/ShopifyPhotoManager';
import ShopifyConditionPhraseDialog from '@/components/features/shopify/ShopifyConditionPhraseDialog';
import ShopifyTaxonomyPicker from '@/components/features/shopify/ShopifyTaxonomyPicker';
import ShopifyPricingPanel from '@/components/features/shopify/ShopifyPricingPanel';
import { mergeIncludedItemsForCategoryChange } from '@/config/shopifyIncludedItems';
import {
  clearShopifyCategoryPatch,
  confirmedShopifyCategoryPatch,
  pickShopifyCategoryFields,
  type ShopifyCategoryFields,
} from '@/lib/shopify/categoryPersistence';
import type { InventoryItem } from '@/types';
import type { ShopifyListing } from '@/types/shopify';
import { useState } from 'react';

export default function ShopifyListingForm({
  draft,
  inventory,
  category,
  readOnly,
  issues,
  storeId,
  employeeId,
  categorySaving,
  categorySaveError,
  onChange,
  onPersistCategory,
  onRegenerateTitle,
  onRegenerateDescription,
  onRegenerateTags,
  onGenerateBarcode,
}: {
  draft: ShopifyListing;
  inventory?: InventoryItem;
  category: SpecCategoryDefinition;
  readOnly?: boolean;
  issues: Array<{ field: string; message: string }>;
  storeId?: string;
  employeeId?: string | null;
  categorySaving?: boolean;
  categorySaveError?: string | null;
  onChange: (updates: Partial<ShopifyListing>) => void;
  onPersistCategory: (fields: ShopifyCategoryFields, extra?: Partial<ShopifyListing>) => void;
  onRegenerateTitle: () => void;
  onRegenerateDescription: () => void;
  onRegenerateTags: () => void;
  onGenerateBarcode?: () => void;
}) {
  const meta = getListerMeta(draft);
  const [cosmeticOpen, setCosmeticOpen] = useState(false);
  const [functionalityOpen, setFunctionalityOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [confirmRegen, setConfirmRegen] = useState(false);
  const titleCount = draft.title.length;
  const titleColor = titleCount <= RECOMMENDED_SHOPIFY_TITLE_LENGTH ? 'text-emerald-700' : 'text-amber-700';
  const cosmeticLabel = getCosmeticOption(meta.cosmeticConditionKey)?.label || 'Select cosmetic condition';
  const functionalityLabel = getFunctionalityOption(meta.functionalityConditionKey)?.label || 'Select functionality';
  const cosmeticPhrase = buildCosmeticPhrase(meta.cosmeticConditionKey, meta.cosmeticConditionNotes);
  const functionalityPhrase = buildFunctionalityPhrase(meta.functionalityConditionKey, meta.functionalityNotes);

  return (
    <fieldset disabled={readOnly} className="space-y-3 disabled:opacity-80">
      {issues.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-[12px] font-semibold text-destructive mb-1">Required before Ready</p>
          <ul className="text-[11px] text-destructive space-y-0.5">
            {issues.map((issue) => <li key={issue.field}>• {issue.message}</li>)}
          </ul>
        </div>
      )}
      {meta.descriptionMode === 'manual' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          Description has been manually edited. Automatic updates are paused.
        </div>
      )}

      <Accordion type="multiple" defaultValue={['category', 'pricing', 'included', 'specs', 'cosmetic', 'functionality', 'shopify', 'details']} className="space-y-2">
        <AccordionItem value="category" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Category / Collection</AccordionTrigger>
          <AccordionContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3">
            <div>
              <Label className="text-[11px]">Collection</Label>
              <Select
                value={category.key}
                onValueChange={(key) => {
                  const next = PRODUCT_SPEC_CATEGORIES.find((c) => c.key === key) || getSpecCategory(key, draft.shopifyVendor);
                  onChange({
                    shopifyProductType: next.productType || key,
                    shopifyVendor: draft.shopifyVendor || next.defaultBrand || '',
                    attributes: { ...draft.attributes, categoryId: key },
                    accessories: mergeIncludedItemsForCategoryChange(
                      draft.accessories,
                      key,
                      draft.shopifyVendor || inventory?.brand || '',
                      inventory?.model || '',
                    ),
                  });
                  if (draft.shopifyCategoryId || draft.shopifyCategoryConfirmed) {
                    onPersistCategory(pickShopifyCategoryFields({
                      ...draft,
                      shopifyCategoryConfirmed: false,
                    }));
                  }
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
              <Label className="text-[11px]">Vendor / Brand</Label>
              <Input value={draft.shopifyVendor} onChange={(e) => onChange({ shopifyVendor: e.target.value })} className="mt-1 h-8 text-[12px]" />
            </div>
            <ShopifyTaxonomyPicker
              categoryKey={category.key}
              currentId={draft.shopifyCategoryId}
              currentFullName={draft.shopifyCategoryFullName}
              confirmed={draft.shopifyCategoryConfirmed === true && !categorySaving && !categorySaveError}
              saving={categorySaving}
              saveError={categorySaveError}
              employeeId={employeeId}
              storeId={storeId}
              onConfirm={(row, attributes) => {
                const patch = confirmedShopifyCategoryPatch(row, attributes);
                onPersistCategory(pickShopifyCategoryFields(patch), {
                  ...(attributes ? {
                    shopifyTaxonomyAttributes: attributes,
                    attributes: {
                      ...draft.attributes,
                      __taxonomyAttributes: attributes,
                    },
                  } : {}),
                });
              }}
              onAttributes={(attributes) => onChange({
                shopifyTaxonomyAttributes: attributes,
                attributes: {
                  ...draft.attributes,
                  __taxonomyAttributes: attributes,
                },
              })}
              onChangeCategory={() => onPersistCategory(pickShopifyCategoryFields({
                ...draft,
                shopifyCategoryConfirmed: false,
              }))}
              onClearCategory={() => onPersistCategory(pickShopifyCategoryFields(clearShopifyCategoryPatch()), {
                shopifyTaxonomyAttributes: [],
                attributes: { ...draft.attributes, __taxonomyAttributes: [] },
              })}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="included" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">What's Included</AccordionTrigger>
          <AccordionContent className="pb-3">
            <ShopifyAccessoriesEditor accessories={draft.accessories} onChange={(accessories) => onChange({ accessories })} />
            <label className="flex items-center gap-2 text-[11px] mt-3">
              <input
                type="checkbox"
                checked={meta.includeNotListedWarning}
                onChange={(e) => onChange({ includeNotListedWarning: e.target.checked })}
              />
              Include “if it is not listed it is not included” warning
            </label>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="specs" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Specifications</AccordionTrigger>
          <AccordionContent className="pb-3">
            <ShopifySpecForm category={category} attributes={draft.attributes} onChange={(attributes) => onChange({ attributes })} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="cosmetic" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Cosmetic Condition</AccordionTrigger>
          <AccordionContent className="pb-3 space-y-2">
            <Button type="button" variant="outline" className="h-8 text-[11px]" onClick={() => setCosmeticOpen(true)}>
              {cosmeticLabel}
            </Button>
            <p className="text-[12px] text-muted-foreground">{cosmeticPhrase || 'Choose a cosmetic condition to generate the listing phrase.'}</p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="functionality" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Functionality</AccordionTrigger>
          <AccordionContent className="pb-3 space-y-3">
            <Button type="button" variant="outline" className="h-8 text-[11px]" onClick={() => setFunctionalityOpen(true)}>
              {functionalityLabel}
            </Button>
            <p className="text-[12px] text-muted-foreground">{functionalityPhrase || 'Choose a functionality condition to generate the listing phrase.'}</p>
            <ShopifyTestingControls tests={category.tests} results={draft.testingResults} onChange={(testingResults) => onChange({ testingResults })} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="extra" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Extra Title Text</AccordionTrigger>
          <AccordionContent className="pb-3">
            <Input
              value={meta.extraTitleText}
              onChange={(e) => onChange({ extraTitleText: e.target.value })}
              className="h-8 text-[12px]"
              placeholder='e.g. w/ Charger'
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="origin" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Country of Origin</AccordionTrigger>
          <AccordionContent className="pb-3">
            <Input value={meta.originCountry} onChange={(e) => onChange({ originCountry: e.target.value })} className="h-8 text-[12px]" placeholder="Optional" />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="photos" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Photos</AccordionTrigger>
          <AccordionContent className="pb-3">
            <ShopifyPhotoManager
              listing={draft}
              photos={draft.photos}
              storeId={storeId}
              employeeId={employeeId}
              onChange={(photos) => onChange({ photos })}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="pricing" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Pricing</AccordionTrigger>
          <AccordionContent className="pb-3">
            <ShopifyPricingPanel draft={draft} inventory={inventory} readOnly={readOnly} onChange={onChange} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="shopify" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Shopify Listing</AccordionTrigger>
          <AccordionContent className="space-y-3 pb-3">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Title</Label>
                <span className={`text-[10px] font-semibold ${titleColor}`}>TITLE COUNTER: {titleCount}</span>
              </div>
              <Input
                value={draft.title}
                onChange={(e) => onChange({ title: e.target.value, titleMode: 'manual' })}
                className="mt-1 h-8 text-[12px]"
              />
              <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] px-0" onClick={onRegenerateTitle}>
                Regenerate Suggested Title
              </Button>
            </div>
            <div>
              <Label className="text-[11px]">Product Type</Label>
              <Input value={draft.shopifyProductType} onChange={(e) => onChange({ shopifyProductType: e.target.value })} className="mt-1 h-8 text-[12px]" />
              <p className="text-[10px] text-muted-foreground mt-1">Custom Shopify product type. Separate from the standard taxonomy category.</p>
            </div>
            <div>
              <Label className="text-[11px]">Public notes</Label>
              <Textarea value={meta.publicNotes} onChange={(e) => onChange({ publicNotes: e.target.value })} className="mt-1 text-[12px] min-h-[72px]" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Edit HTML / Manual Description</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() => {
                    if (meta.descriptionMode === 'manual') setConfirmRegen(true);
                    else onRegenerateDescription();
                  }}
                >
                  Regenerate Description
                </Button>
              </div>
              <Textarea
                value={draft.description}
                onChange={(e) => onChange({ description: e.target.value, descriptionMode: 'manual' })}
                className="mt-1 text-[12px] min-h-[160px] font-mono"
              />
            </div>
            <div>
              <Label className="text-[11px]">Tags</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {draft.tags.map((tag) => (
                  <button key={tag} type="button" className="text-[10px] px-2 py-0.5 rounded-full border bg-secondary" onClick={() => onChange({ tags: draft.tags.filter((t) => t !== tag) })}>
                    {tag} ×
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} className="h-8 text-[12px]" placeholder="Add tag" />
                <Button type="button" variant="outline" className="h-8 text-[11px]" onClick={() => {
                  const tag = tagInput.trim();
                  if (!tag || draft.tags.includes(tag)) return;
                  onChange({ tags: [...draft.tags, tag] });
                  setTagInput('');
                }}>Add</Button>
                <Button type="button" variant="ghost" className="h-8 text-[11px]" onClick={onRegenerateTags}>Suggest</Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="details" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">More Details</AccordionTrigger>
          <AccordionContent className="pb-3 space-y-3">
            <div>
              <Label className="text-[11px]">SKU</Label>
              <p className="mt-1 h-8 flex items-center font-mono text-[12px]">{draft.sku || inventory?.deviceCode || '—'}</p>
              <p className="text-[10px] text-muted-foreground">POS Device Code. Not the retail barcode.</p>
            </div>
            <div>
              <Label className="text-[11px]">Barcode</Label>
              {draft.barcode ? (
                <p className="mt-1 h-8 flex items-center font-mono text-[12px]">{draft.barcode}</p>
              ) : (
                <div className="mt-1 space-y-2">
                  <p className="text-[12px] text-muted-foreground">Barcode will be generated when listing is published.</p>
                  {onGenerateBarcode && !readOnly ? (
                    <Button type="button" variant="outline" className="h-8 text-[11px]" onClick={onGenerateBarcode}>
                      Generate Barcode Now
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="internal" className="border rounded-lg px-3 bg-card">
          <AccordionTrigger className="text-[12px] font-semibold py-3 hover:no-underline">Internal Notes</AccordionTrigger>
          <AccordionContent className="pb-3 space-y-2">
            <p className="text-[11px] text-muted-foreground">Staff notes, serial, and IMEI stay in the POS and are not published.</p>
            {inventory && (
              <p className="text-[11px] font-mono">Internal SN/IMEI: {inventory.serialImei || '—'}</p>
            )}
            <Textarea value={draft.staffNotes} onChange={(e) => onChange({ staffNotes: e.target.value })} className="text-[12px] min-h-[72px]" />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <ShopifyConditionPhraseDialog
        open={cosmeticOpen}
        title="Cosmetic Condition"
        options={COSMETIC_CONDITION_OPTIONS}
        value={meta.cosmeticConditionKey}
        extraNotes={meta.cosmeticConditionNotes}
        phraseText={cosmeticPhrase}
        onOpenChange={setCosmeticOpen}
        onChange={(key) => {
          const label = getCosmeticOption(key)?.label || key;
          onChange({
            cosmeticConditionKey: key,
            condition: label,
            attributes: { ...draft.attributes, cosmeticCondition: label },
          });
        }}
        onNotesChange={(cosmeticConditionNotes) => onChange({ cosmeticConditionNotes })}
      />
      <ShopifyConditionPhraseDialog
        open={functionalityOpen}
        title="Functionality Condition"
        options={FUNCTIONALITY_CONDITION_OPTIONS}
        value={meta.functionalityConditionKey}
        extraNotes={meta.functionalityNotes}
        phraseText={functionalityPhrase}
        onOpenChange={setFunctionalityOpen}
        onChange={(key) => onChange({
          functionalityConditionKey: key,
          attributes: { ...draft.attributes, functionalCondition: getFunctionalityOption(key)?.label || key },
        })}
        onNotesChange={(functionalityNotes) => onChange({ functionalityNotes })}
        footer={(
          <Button
            type="button"
            variant="outline"
            className="h-8 text-[11px]"
            onClick={() => {
              const next: Record<string, typeof draft.testingResults[string]> = { ...draft.testingResults };
              category.tests.forEach((test) => {
                if (next[test.id] !== 'not-applicable') next[test.id] = 'pass';
              });
              onChange({
                testingResults: next,
                functionalityConditionKey: 'FULLY_FUNCTIONAL',
                attributes: { ...draft.attributes, functionalCondition: 'Fully Functional' },
              });
            }}
          >
            Select All Fully Functional
          </Button>
        )}
      />

      {confirmRegen && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px]">
          <p>Regenerate Description and replace your manual HTML edits?</p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" className="h-7 text-[10px]" onClick={() => { setConfirmRegen(false); onRegenerateDescription(); }}>Replace</Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setConfirmRegen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </fieldset>
  );
}
