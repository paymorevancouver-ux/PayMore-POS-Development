import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_SHOPIFY_SELECTION } from '@/lib/shopify/constants';
import { useShopifyListerStore } from '@/stores/shopifyListerStore';

describe('Shopify Auto Lister tabs', () => {
  beforeEach(() => {
    useShopifyListerStore.setState({
      openListingIds: [],
      activeListingId: null,
    });
  });

  it('opens up to 10 tabs and ignores extra ids', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `SFL-${i + 1}`);
    useShopifyListerStore.getState().openTabs(ids, ids[0]);
    const state = useShopifyListerStore.getState();
    expect(state.openListingIds).toHaveLength(MAX_SHOPIFY_SELECTION);
    expect(state.activeListingId).toBe('SFL-1');
  });

  it('preserves open drafts when switching the active tab', () => {
    useShopifyListerStore.getState().openTabs(['SFL-1', 'SFL-2'], 'SFL-1');
    useShopifyListerStore.getState().setActiveTab('SFL-2');
    const state = useShopifyListerStore.getState();
    expect(state.openListingIds).toEqual(['SFL-1', 'SFL-2']);
    expect(state.activeListingId).toBe('SFL-2');
  });

  it('closing a tab does not clear the remaining tabs', () => {
    useShopifyListerStore.getState().openTabs(['SFL-1', 'SFL-2'], 'SFL-2');
    useShopifyListerStore.getState().closeTab('SFL-2');
    const state = useShopifyListerStore.getState();
    expect(state.openListingIds).toEqual(['SFL-1']);
    expect(state.activeListingId).toBe('SFL-1');
  });
});
