import { describe, expect, it } from 'vitest';
import { getSpecCategory, isInternalOnlyField, isPublicField } from '@/config/productSpecifications';
import { assertNoInternalLeak, filterPublicAttributes, isInternalAttributeKey } from './visibility';

describe('public vs internal field protection', () => {
  it('marks IMEI and serial as internal-only on phones', () => {
    const iphone = getSpecCategory('apple-iphone');
    const imei = iphone.fields.find((f) => f.key === 'imei1');
    const serial = iphone.fields.find((f) => f.key === 'serialNumber');
    const storage = iphone.fields.find((f) => f.key === 'storage.primaryCapacity');
    expect(imei && isInternalOnlyField(imei)).toBe(true);
    expect(serial && isInternalOnlyField(serial)).toBe(true);
    expect(storage && isPublicField(storage)).toBe(true);
  });

  it('filters internal keys out of public attribute maps', () => {
    const publicAttrs = filterPublicAttributes('apple-iphone', 'Apple', {
      color: 'Black',
      imei1: '123',
      serialNumber: 'ABC',
      'storage.primaryCapacity': '256GB',
    });
    expect(publicAttrs.color).toBe('Black');
    expect(publicAttrs.imei1).toBeUndefined();
    expect(publicAttrs.serialNumber).toBeUndefined();
  });

  it('detects internal leaks in generated text', () => {
    expect(isInternalAttributeKey('imei1')).toBe(true);
    expect(isInternalAttributeKey('color')).toBe(false);
    expect(assertNoInternalLeak('Cost $200 IMEI 123')).toEqual(['IMEI', 'Cost']);
    expect(assertNoInternalLeak('Apple iPhone 15 Pro 256GB')).toEqual([]);
  });
});
