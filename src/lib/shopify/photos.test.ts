import { describe, expect, it } from 'vitest';
import {
  canAddListingPhotos,
  listingPhotoAssets,
  listingPhotoSources,
  listingPhotosSignature,
  mergeCapturedPhotoUrls,
  photoSourceKind,
  remainingPhotoSlots,
  reorderListingPhotos,
} from './photos';
import type { ShopifyListingPhoto } from '@/types/shopify';

describe('Shopify listing photos', () => {
  it('enforces the 12-photo maximum', () => {
    const photos = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      url: `https://signed.example/${i}.jpg`,
      sortOrder: i,
      source: 'desktop' as const,
    }));
    expect(remainingPhotoSlots(photos)).toBe(7);
    expect(canAddListingPhotos(photos, 7)).toBe(true);
    expect(canAddListingPhotos(photos, 8)).toBe(false);
    expect(canAddListingPhotos(Array.from({ length: 12 }, (_, i) => `data:image/jpeg;base64,${i}`))).toBe(false);
  });

  it('persists mobile photo objects alongside legacy desktop strings', () => {
    const photos: ShopifyListingPhoto[] = [
      'data:image/jpeg;base64,AAA',
      { id: 'mobile-1', path: 'STR-001/SFL-1/uuid.jpg', url: 'https://signed.example/uuid.jpg', sortOrder: 1, source: 'mobile' },
    ];
    expect(listingPhotoSources(photos)).toEqual([
      'data:image/jpeg;base64,AAA',
      'https://signed.example/uuid.jpg',
    ]);
  });

  it('refreshes the desktop photo list when a mobile upload arrives', () => {
    const current: ShopifyListingPhoto[] = [
      { id: 'a', url: 'https://signed.example/a.jpg', sortOrder: 0, source: 'purchase' },
    ];
    const incoming: ShopifyListingPhoto[] = [
      ...current,
      { id: 'b', url: 'https://signed.example/b.jpg', sortOrder: 1, source: 'mobile' },
    ];
    expect(listingPhotosSignature(current)).not.toBe(listingPhotosSignature(incoming));
    expect(listingPhotoSources(incoming)).toHaveLength(2);
  });

  it('keeps existing assets when desktop capture URLs are merged', () => {
    const current: ShopifyListingPhoto[] = [
      { id: 'keep', url: 'https://signed.example/keep.jpg', sortOrder: 0, source: 'mobile' },
    ];
    const merged = mergeCapturedPhotoUrls(current, [
      'https://signed.example/keep.jpg',
      'data:image/jpeg;base64,BBB',
    ]);
    expect(merged[0]).toMatchObject({ id: 'keep', source: 'mobile' });
    expect(listingPhotoSources(merged)).toHaveLength(2);
  });

  it('classifies listing photo sources without treating data URLs as HTTP', () => {
    expect(photoSourceKind('data:image/jpeg;base64,AAA')).toBe('data-url');
    expect(photoSourceKind('https://signed.example/uuid.jpg')).toBe('http');
    expect(photoSourceKind('', 'STR-001/SFL-1/uuid.jpg')).toBe('storage-path');
    const assets = listingPhotoAssets([
      'data:image/jpeg;base64,AAA',
      { id: 'mobile-1', path: 'STR-001/SFL-1/uuid.jpg', url: 'https://signed.example/uuid.jpg' },
    ]);
    expect(assets.map((row) => row.kind)).toEqual(['data-url', 'http']);
  });

  it('reorders photos without dropping mobile metadata', () => {
    const photos: ShopifyListingPhoto[] = [
      { id: 'first', url: 'https://a', sortOrder: 0, source: 'desktop' },
      { id: 'second', url: 'https://b', sortOrder: 1, source: 'mobile' },
    ];
    const reordered = reorderListingPhotos(photos, 1, 0);
    expect(reordered.map((photo) => typeof photo === 'string' ? photo : photo.id)).toEqual(['second', 'first']);
    expect(reordered[0]).toMatchObject({ source: 'mobile', sortOrder: 0 });
  });
});
