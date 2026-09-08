import { describe, expect, it } from 'vitest';
import {
  BARCODE_MISMATCH_MESSAGE,
  barcodeForShopify,
  barcodesEqual,
  buildUpcA,
  canPrintShopifyListingLabel,
  collectTakenBarcodes,
  detectBarcodeMismatch,
  generateRetailBarcode,
  inventoryItemCostUpdateInput,
  isReusableRetailBarcode,
  resolveExistingBarcode,
  upcACheckDigit,
} from './retailBarcode';

describe('retail barcode generation', () => {
  it('reuses an existing POS barcode', () => {
    expect(resolveExistingBarcode({
      inventoryBarcode: '194253726201',
      listingBarcode: '',
      deviceCode: 'BC05-000623',
      serialImei: '356789012345678',
    })).toBe('194253726201');
  });

  it('generates a unique UPC-A when missing', () => {
    const barcode = generateRetailBarcode({
      deviceCode: 'BC05-000623',
      inventoryId: 'INV-1',
      taken: new Set(),
    });
    expect(barcode).toHaveLength(12);
    expect(barcode).toBe(buildUpcA(barcode.slice(0, 11)));
    expect(upcACheckDigit('03600029145')).toBe('2');
  });

  it('skips taken barcodes until unique', () => {
    const first = generateRetailBarcode({
      deviceCode: 'BC05-000623',
      inventoryId: 'INV-1',
      taken: new Set(),
    });
    const second = generateRetailBarcode({
      deviceCode: 'BC05-000623',
      inventoryId: 'INV-1',
      taken: new Set([first]),
    });
    expect(second).not.toBe(first);
    expect(second).toHaveLength(12);
  });

  it('never uses IMEI as a barcode', () => {
    expect(isReusableRetailBarcode('356789012345678')).toBe(false);
    expect(barcodeForShopify('356789012345678')).toBe('');
    expect(resolveExistingBarcode({
      upcSku: '356789012345678',
      serialImei: '356789012345678',
      deviceCode: 'BC05-000623',
    })).toBe('');
  });

  it('never uses serial as a barcode', () => {
    expect(isReusableRetailBarcode('IMEI SN-999')).toBe(false);
    expect(resolveExistingBarcode({
      listingBarcode: 'SN-999',
      serialImei: 'SN-999',
      deviceCode: 'BC05-000623',
    })).toBe('');
  });

  it('never uses device code / SKU as barcode', () => {
    expect(isReusableRetailBarcode('BC05-000623', { deviceCode: 'BC05-000623' })).toBe(false);
    expect(barcodeForShopify('BC05-000623', { sku: 'BC05-000623' })).toBe('');
  });

  it('detects Shopify/POS barcode mismatch', () => {
    expect(detectBarcodeMismatch('194253726201', '111111111111')).toBe(BARCODE_MISMATCH_MESSAGE);
    expect(detectBarcodeMismatch('194253726201', '194253726201')).toBeNull();
    expect(barcodesEqual('194253726201', '194253726201')).toBe(true);
  });

  it('builds the Shopify inventoryItem cost payload from POS cost', () => {
    expect(inventoryItemCostUpdateInput(50)).toEqual({ cost: '50.00', tracked: true });
    expect(inventoryItemCostUpdateInput(0)).toEqual({ cost: '0.00', tracked: true });
  });

  it('collects duplicate barcodes from inventory and listings', () => {
    const taken = collectTakenBarcodes({
      inventory: [{ id: 'INV-2', barcode: '405000006234' }],
      listings: [{ inventoryItemId: 'INV-3', barcode: '111111111111' }],
      exceptInventoryId: 'INV-1',
    });
    expect(taken.has('405000006234')).toBe(true);
    expect(taken.has('111111111111')).toBe(true);
  });

  it('allows a label only after a successful Shopify publish with barcode', () => {
    expect(canPrintShopifyListingLabel({ status: 'draft', barcode: '194253726201' })).toBe(false);
    expect(canPrintShopifyListingLabel({
      status: 'active',
      barcode: '194253726201',
      shopifyProductId: 'gid://shopify/Product/1',
    })).toBe(true);
    expect(canPrintShopifyListingLabel({
      status: 'active',
      barcode: 'BC05-000609',
      shopifyProductId: 'gid://shopify/Product/1',
      sku: 'BC05-000609',
    })).toBe(false);
  });
});
