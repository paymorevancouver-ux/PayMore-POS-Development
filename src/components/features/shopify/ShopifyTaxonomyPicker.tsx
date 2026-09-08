import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { shopifyCatalogService } from '@/services/shopify';
import { SHOPIFY_TAXONOMY_SEARCH_DEBOUNCE_MS } from '@/lib/shopify/constants';
import { shopifyCategoryStatusLabel } from '@/lib/shopify/categoryPersistence';
import { taxonomyFailureMessage, taxonomySearchHints } from '@/lib/shopify/taxonomy';
import type { ShopifyTaxonomyAttribute, ShopifyTaxonomyCategory } from '@/types/shopify';

export default function ShopifyTaxonomyPicker({
  categoryKey,
  currentId,
  currentFullName,
  confirmed,
  saving,
  saveError,
  employeeId,
  storeId,
  onConfirm,
  onAttributes,
  onChangeCategory,
  onClearCategory,
}: {
  categoryKey: string;
  currentId?: string | null;
  currentFullName?: string | null;
  confirmed?: boolean;
  saving?: boolean;
  saveError?: string | null;
  employeeId?: string | null;
  storeId?: string | null;
  onConfirm: (category: ShopifyTaxonomyCategory, attributes?: ShopifyTaxonomyAttribute[]) => void;
  onAttributes?: (attributes: ShopifyTaxonomyAttribute[]) => void;
  onChangeCategory?: () => void;
  onClearCategory?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShopifyTaxonomyCategory[]>([]);
  const [suggested, setSuggested] = useState<ShopifyTaxonomyCategory | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const hints = useMemo(() => taxonomySearchHints(categoryKey), [categoryKey]);

  const [retryTick, setRetryTick] = useState(0);
  const hintKey = hints.join('|');
  const status = shopifyCategoryStatusLabel({
    saving,
    error: saveError,
    confirmed,
    selected: Boolean(currentId),
  });

  async function confirm(row: ShopifyTaxonomyCategory) {
    onConfirm(row);
    setQuery('');
    setResults([]);
    if (!employeeId) return;
    const result = await shopifyCatalogService.searchTaxonomy({
      action: 'get',
      employeeId,
      storeId,
      id: row.id,
    });
    if (result.success && result.attributes?.length) {
      onAttributes?.(result.attributes);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function suggest() {
      if (!employeeId) return;
      const result = await shopifyCatalogService.searchTaxonomy({
        action: 'suggest',
        employeeId,
        storeId,
        searchTerms: hints,
      });
      if (cancelled) return;
      if (!result.success) setError(taxonomyFailureMessage(result.error));
      else {
        setError('');
        setSuggested(result.category || result.categories[0] || null);
      }
    }
    void suggest();
    return () => { cancelled = true; };
  }, [categoryKey, employeeId, hintKey, retryTick, storeId]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      setLoading(true);
      const result = await shopifyCatalogService.searchTaxonomy({
        action: 'search',
        employeeId,
        storeId,
        query: query.trim(),
      });
      setLoading(false);
      if (!result.success) {
        setError(taxonomyFailureMessage(result.error));
        setResults([]);
        return;
      }
      setError('');
      setResults(result.categories);
    }, SHOPIFY_TAXONOMY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [employeeId, query, retryTick, storeId]);

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label className="text-[11px]">Shopify Product Category</Label>
      <p className="text-[11px] text-muted-foreground">
        This is Shopify’s Standard Product Taxonomy. Product Type stays as our business classification.
      </p>
      {currentFullName && (
        <div className="rounded-md border px-3 py-2 text-[12px]">
          <p className="font-medium">{currentFullName}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{currentId}</p>
          <p className={`text-[10px] mt-1 ${saveError ? 'text-destructive' : confirmed ? 'text-emerald-700' : 'text-muted-foreground'}`}>
            {status}
          </p>
          <div className="flex gap-2 mt-2">
            {!confirmed && currentId && !saving && (
              <Button type="button" size="sm" className="h-7 text-[10px]" disabled={saving} onClick={() => {
                if (!currentId) return;
                void confirm({
                  id: currentId,
                  name: currentFullName?.split('>').pop()?.trim() || currentFullName || '',
                  fullName: currentFullName || '',
                });
              }}>Confirm</Button>
            )}
            <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" disabled={saving} onClick={() => {
              onChangeCategory?.();
              setQuery(hints[0] || currentFullName || '');
            }}>Change</Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px]" disabled={saving} onClick={() => onClearCategory?.()}>Clear</Button>
          </div>
        </div>
      )}
      {suggested && suggested.id !== currentId && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px]">
          <p className="font-medium">Suggested Shopify Category</p>
          <p>{suggested.fullName || suggested.name}</p>
          <div className="flex gap-2 mt-2">
            <Button type="button" size="sm" className="h-7 text-[10px]" disabled={saving} onClick={() => void confirm(suggested)}>Confirm</Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" disabled={saving} onClick={() => {
              onChangeCategory?.();
              setQuery(hints[0] || suggested.name);
            }}>Change</Button>
          </div>
        </div>
      )}
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-8 text-[12px]"
        placeholder="Search Shopify categories..."
      />
      {loading && <p className="text-[11px] text-muted-foreground">Searching Shopify taxonomy…</p>}
      {error && (
        <div className="text-[11px] text-destructive">
          {error} <button type="button" className="underline" onClick={() => setRetryTick((value) => value + 1)}>Retry</button>
        </div>
      )}
      {results.length > 0 && (
        <div className="max-h-40 overflow-auto rounded-md border">
          {results.map((row) => (
            <button
              key={row.id}
              type="button"
              disabled={saving}
              className="block w-full text-left px-3 py-2 text-[12px] hover:bg-secondary disabled:opacity-60"
              onClick={() => { void confirm(row); }}
            >
              <span className="block font-medium">{row.fullName || row.name}</span>
              <span className="block font-mono text-[10px] text-muted-foreground">{row.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
