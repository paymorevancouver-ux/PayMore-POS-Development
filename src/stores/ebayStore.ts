import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

export type EbayListingStatus = 'not-listed' | 'listed' | 'sold' | 'ended' | 'error';

export interface EbayListing {
  inventoryItemId: string;
  sku: string;
  ebayListingId?: string;
  ebayOfferId?: string;
  ebayItemUrl?: string;
  status: EbayListingStatus;
  listedPrice?: number;
  listedAt?: string;
  endedAt?: string;
  soldAt?: string;
  lastSyncAt?: string;
  errorMessage?: string;
}

export interface EbaySyncLog {
  id: string;
  action: string;
  sku: string;
  itemTitle: string;
  status: 'success' | 'error';
  details: string;
  createdAt: string;
}

export interface EbayAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
  isConnected: boolean;
}

interface EbayState {
  // Auth
  auth: EbayAuthState;
  setAuth: (auth: Partial<EbayAuthState>) => void;
  clearAuth: () => void;

  // Listings
  listings: EbayListing[];
  setListing: (listing: EbayListing) => void;
  removeListing: (inventoryItemId: string) => void;
  getListingByInventoryId: (inventoryItemId: string) => EbayListing | undefined;
  getListingBySku: (sku: string) => EbayListing | undefined;

  // Sync Logs
  syncLogs: EbaySyncLog[];
  addSyncLog: (log: Omit<EbaySyncLog, 'id' | 'createdAt'>) => void;
  clearSyncLogs: () => void;

  // Stats
  getStats: () => { listed: number; notListed: number; sold: number; ended: number; totalListedValue: number };
}

async function invokeEbay(body: Record<string, unknown>): Promise<{ data: any; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('ebay-sync', { body });
  if (error) {
    let errorMessage = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const textContent = await error.context?.text();
        const parsed = textContent ? JSON.parse(textContent) : null;
        errorMessage = parsed?.error || textContent || error.message;
      } catch {
        errorMessage = error.message;
      }
    }
    return { data: null, error: errorMessage };
  }
  return { data, error: null };
}

export const useEbayStore = create<EbayState>()(
  persist(
    (set, get) => ({
      auth: {
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        isConnected: false,
      },

      setAuth: (authUpdate) => {
        set((s) => ({ auth: { ...s.auth, ...authUpdate } }));
      },
      clearAuth: () => {
        set({
          auth: {
            accessToken: null,
            refreshToken: null,
            tokenExpiresAt: null,
            isConnected: false,
          },
        });
      },

      listings: [],
      setListing: (listing) => {
        set((s) => {
          const existing = s.listings.findIndex((l) => l.inventoryItemId === listing.inventoryItemId);
          if (existing >= 0) {
            const updated = [...s.listings];
            updated[existing] = listing;
            return { listings: updated };
          }
          return { listings: [...s.listings, listing] };
        });
      },
      removeListing: (inventoryItemId) => {
        set((s) => ({ listings: s.listings.filter((l) => l.inventoryItemId !== inventoryItemId) }));
      },
      getListingByInventoryId: (inventoryItemId) => {
        return get().listings.find((l) => l.inventoryItemId === inventoryItemId);
      },
      getListingBySku: (sku) => {
        return get().listings.find((l) => l.sku === sku);
      },

      syncLogs: [],
      addSyncLog: (log) => {
        const entry: EbaySyncLog = {
          ...log,
          id: `ESLOG-${Date.now().toString(36)}`,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ syncLogs: [entry, ...s.syncLogs].slice(0, 200) }));
      },
      clearSyncLogs: () => set({ syncLogs: [] }),

      getStats: () => {
        const listings = get().listings;
        return {
          listed: listings.filter((l) => l.status === 'listed').length,
          notListed: listings.filter((l) => l.status === 'not-listed').length,
          sold: listings.filter((l) => l.status === 'sold').length,
          ended: listings.filter((l) => l.status === 'ended').length,
          totalListedValue: listings
            .filter((l) => l.status === 'listed' && l.listedPrice)
            .reduce((sum, l) => sum + (l.listedPrice || 0), 0),
        };
      },
    }),
    { name: 'paymore-ebay-v1' }
  )
);

// Export the invoke helper for use in components
export { invokeEbay };
