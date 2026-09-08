import { MAX_SHOPIFY_PHOTOS } from '@/lib/shopify/constants';
import type { ShopifyListingPhoto, ShopifyListingPhotoAsset } from '@/types/shopify';

export function isPhotoAsset(photo: ShopifyListingPhoto): photo is ShopifyListingPhotoAsset {
  return Boolean(photo && typeof photo === 'object' && 'url' in photo);
}

export function listingPhotoUrl(photo: ShopifyListingPhoto | null | undefined): string {
  if (!photo) return '';
  if (typeof photo === 'string') return photo;
  return String(photo.url || '');
}

export type PhotoSourceKind = 'http' | 'data-url' | 'storage-path' | 'empty' | 'unsupported';

export function photoSourceKind(value: string | null | undefined, path?: string | null): PhotoSourceKind {
  const raw = String(value || '').trim();
  const storagePath = String(path || '').trim();
  if (!raw && !storagePath) return 'empty';
  if (raw.startsWith('data:image/')) return 'data-url';
  if (/^https?:\/\//i.test(raw)) return 'http';
  if (storagePath || (!raw.startsWith('data:') && raw.includes('/'))) return 'storage-path';
  return 'unsupported';
}

export function listingPhotoAssets(photos: ShopifyListingPhoto[] | unknown): Array<{ url: string; path?: string; kind: PhotoSourceKind; index: number }> {
  if (!Array.isArray(photos)) return [];
  return photos.map((photo, index) => {
    if (typeof photo === 'string') {
      return { url: photo.trim(), kind: photoSourceKind(photo), index };
    }
    const asset = photo as ShopifyListingPhotoAsset;
    const url = String(asset.url || '').trim();
    const path = String(asset.path || '').trim() || undefined;
    return { url, path, kind: photoSourceKind(url, path), index };
  }).filter((row) => row.kind !== 'empty');
}

export function listingPhotoSources(photos: ShopifyListingPhoto[] | unknown): string[] {
  if (!Array.isArray(photos)) return [];
  return photos.map((photo) => listingPhotoUrl(photo as ShopifyListingPhoto)).filter((url) => Boolean(url.trim()));
}

export function normalizeListingPhotos(photos: ShopifyListingPhoto[] | unknown): ShopifyListingPhotoAsset[] {
  if (!Array.isArray(photos)) return [];
  return photos.map((photo, index) => {
    if (typeof photo === 'string') {
      return {
        id: `legacy-${index}`,
        url: photo,
        sortOrder: index,
        source: photo.startsWith('data:') ? 'desktop' : 'purchase',
      };
    }
    const asset = photo as ShopifyListingPhotoAsset;
    return {
      id: asset.id || `photo-${index}`,
      path: asset.path,
      url: asset.url,
      sortOrder: asset.sortOrder ?? index,
      source: asset.source || 'desktop',
    };
  });
}

export function remainingPhotoSlots(photos: ShopifyListingPhoto[] | unknown, max = MAX_SHOPIFY_PHOTOS): number {
  return Math.max(0, max - listingPhotoSources(photos).length);
}

export function canAddListingPhotos(photos: ShopifyListingPhoto[] | unknown, adding = 1, max = MAX_SHOPIFY_PHOTOS): boolean {
  return remainingPhotoSlots(photos, max) >= adding;
}

export function reorderListingPhotos(photos: ShopifyListingPhoto[], from: number, to: number): ShopifyListingPhoto[] {
  if (to < 0 || to >= photos.length || from === to) return photos;
  const next = [...photos];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((photo, index) => (isPhotoAsset(photo) ? { ...photo, sortOrder: index } : photo));
}

export function desktopPhotoFromDataUrl(url: string, index: number): ShopifyListingPhotoAsset {
  return {
    id: `desktop-${Date.now().toString(36)}-${index}`,
    url,
    sortOrder: index,
    source: 'desktop',
  };
}

export function listingPhotosSignature(photos: ShopifyListingPhoto[] | unknown): string {
  if (!Array.isArray(photos)) return '';
  return photos.map((photo, index) => {
    if (typeof photo === 'string') return `s:${index}:${photo}`;
    const asset = photo as ShopifyListingPhotoAsset;
    return `a:${asset.id || index}:${asset.path || ''}:${asset.url}`;
  }).join('|');
}

export function mergeCapturedPhotoUrls(
  current: ShopifyListingPhoto[],
  nextUrls: string[],
): ShopifyListingPhoto[] {
  const byUrl = new Map(current.map((photo) => [listingPhotoUrl(photo), photo]));
  return nextUrls.map((url, index) => {
    const existing = byUrl.get(url);
    if (existing) {
      return isPhotoAsset(existing) ? { ...existing, sortOrder: index } : existing;
    }
    return desktopPhotoFromDataUrl(url, index);
  });
}
