import type { DeviceAccessory, DeviceSpecifications, TestResult } from '@/types';
import { getDeviceCategory, type DeviceCategoryDefinition } from '@/lib/deviceCategories';

export function emptySpecifications(categoryId?: string): DeviceSpecifications {
  const def = categoryId ? getDeviceCategory(categoryId) : undefined;
  const accessories: DeviceAccessory[] = (def?.accessories || []).map((a) => ({
    id: a.id,
    included: false,
    quantity: a.quantity ? 1 : undefined,
  }));
  const tests: Record<string, TestResult> = {};
  for (const test of def?.tests || []) tests[test.id] = 'not-tested';
  const specs: DeviceSpecifications = {
    categoryId: def?.id,
    modelNumber: '',
    color: '',
    upcSku: '',
    accessories,
    otherAccessories: '',
    tests,
    conditionDetails: {},
  };
  if (def?.storageList) specs.storage = [{ type: '', capacity: '' }];
  if (def?.lensList) specs.lenses = [];
  return specs;
}

export function parseSpecifications(raw: unknown): DeviceSpecifications {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as DeviceSpecifications;
}

export function specDisplay(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not Recorded';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return 'Not Recorded';
}

export function getSpecValue(specs: DeviceSpecifications | undefined, path: string): unknown {
  if (!specs || !path) return '';
  const parts = path.split('.');
  let cur: unknown = specs;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur ?? '';
}

export function setSpecValue(specs: DeviceSpecifications, path: string, value: unknown): DeviceSpecifications {
  const parts = path.split('.');
  const next: Record<string, unknown> = { ...specs };
  if (parts.length === 1) {
    next[parts[0]] = value;
    return next as DeviceSpecifications;
  }
  const [head, ...rest] = parts;
  const child = (next[head] && typeof next[head] === 'object' && !Array.isArray(next[head]))
    ? { ...(next[head] as Record<string, unknown>) }
    : {};
  let cursor = child;
  for (let i = 0; i < rest.length - 1; i++) {
    const key = rest[i];
    const existing = cursor[key];
    cursor[key] = existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[rest[rest.length - 1]] = value;
  next[head] = child;
  return next as DeviceSpecifications;
}

function joinParts(parts: Array<string | undefined | null>): string {
  return parts.map((p) => (p || '').trim()).filter(Boolean).join(' / ');
}

function firstStorage(specs: DeviceSpecifications): string {
  const drives = Array.isArray(specs.storage) ? specs.storage : [];
  return drives
    .map((d) => [d.capacity, d.type].filter(Boolean).join(' ').trim())
    .filter(Boolean)
    .join(' + ');
}

export function generateListingTitle(args: {
  category?: string;
  brand: string;
  model: string;
  specifications?: DeviceSpecifications;
}): string {
  const specs = args.specifications || {};
  const def: DeviceCategoryDefinition | undefined = getDeviceCategory(specs.categoryId || args.category || '');
  const brand = (args.brand || '').trim();
  const model = (args.model || '').trim();
  const modelNumber = String(specs.modelNumber || '').trim();
  const color = String(specs.color || '').trim();
  const id = def?.id || specs.categoryId || '';

  if (id === 'windows-laptop') {
    const cpu = getSpecValue(specs, 'cpu.model') as string;
    const gpu = getSpecValue(specs, 'gpu.model') as string;
    const ram = getSpecValue(specs, 'ram.capacity') as string;
    const storage = firstStorage(specs) || String(getSpecValue(specs, 'storage.capacity') || '');
    const core = joinParts([cpu, gpu, ram, storage]);
    const head = [brand, model, modelNumber].filter(Boolean).join(' ');
    return core ? `${head} – ${core}` : head;
  }

  if (id === 'macbook') {
    const chip = String(getSpecValue(specs, 'chip') || getSpecValue(specs, 'cpu.model') || '').trim();
    const ram = String(getSpecValue(specs, 'ram.capacity') || '').trim();
    const storage = firstStorage(specs) || String(getSpecValue(specs, 'storage.capacity') || '');
    const size = String(getSpecValue(specs, 'display.size') || '').trim();
    const head = [brand || 'Apple', model, size ? `${size}"` : '', modelNumber].filter(Boolean).join(' ');
    const core = joinParts([chip, ram, storage]);
    return core ? `${head} – ${core}` : head;
  }

  if (id === 'apple-iphone' || id === 'android-phone') {
    const storage = String(getSpecValue(specs, 'storage.capacity') || '').trim();
    const unlocked = String(getSpecValue(specs, 'carrierStatus') || getSpecValue(specs, 'unlocked') || '').trim();
    const carrierBit = unlocked === 'Unlocked' || unlocked === 'Yes' ? 'Unlocked' : '';
    return [brand, model, storage, color, carrierBit].filter(Boolean).join(' ');
  }

  if (id === 'digital-camera' || id === 'dslr-camera' || id === 'mirrorless-camera') {
    const mp = String(getSpecValue(specs, 'megapixels') || '').trim();
    const zoom = String(getSpecValue(specs, 'opticalZoom') || '').trim();
    const typeLabel = def?.label || args.category || '';
    return [brand, model, mp ? `${mp}MP` : '', zoom ? `${zoom} Optical Zoom` : '', typeLabel].filter(Boolean).join(' ');
  }

  if (id === 'custom-gaming-pc') {
    const cpu = String(getSpecValue(specs, 'cpu.model') || '').trim();
    const gpu = String(getSpecValue(specs, 'gpu.model') || '').trim();
    const ram = String(getSpecValue(specs, 'ram.capacity') || '').trim();
    const storage = firstStorage(specs);
    const head = [brand, model].filter(Boolean).join(' ') || 'Custom Gaming PC';
    const core = joinParts([cpu, gpu, ram, storage]);
    return core ? `${head} – ${core}` : head;
  }

  const extras = joinParts([
    String(getSpecValue(specs, 'storage.capacity') || ''),
    String(getSpecValue(specs, 'ram.capacity') || ''),
    color,
    modelNumber,
  ]);
  const head = [brand, model].filter(Boolean).join(' ');
  return extras ? `${head} – ${extras}` : head;
}

export function includedAccessories(specs?: DeviceSpecifications): string {
  if (!specs?.accessories?.length) return '';
  const names = specs.accessories.filter((a) => a.included).map((a) => a.note || a.id);
  const other = (specs.otherAccessories || '').trim();
  return [...names, other].filter(Boolean).join(', ');
}

export function hasFindMyOn(specs?: DeviceSpecifications): boolean {
  const v = String(getSpecValue(specs, 'findMyIphone') || '').toUpperCase();
  return v === 'ON';
}

export function flattenSpecsForDisplay(specs?: DeviceSpecifications): Array<{ label: string; value: string }> {
  if (!specs || Object.keys(specs).length === 0) return [];
  const rows: Array<{ label: string; value: string }> = [];
  const skip = new Set(['categoryId', 'accessories', 'otherAccessories', 'tests', 'conditionDetails', 'storage', 'lenses']);
  const walk = (obj: Record<string, unknown>, prefix = '') => {
    for (const [key, value] of Object.entries(obj)) {
      if (skip.has(key)) continue;
      const label = prefix ? `${prefix} / ${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        walk(value as Record<string, unknown>, label);
      } else {
        const text = specDisplay(value);
        if (text !== 'Not Recorded') rows.push({ label, value: text });
      }
    }
  };
  walk(specs as Record<string, unknown>);
  if (Array.isArray(specs.storage)) {
    const text = firstStorage(specs);
    if (text) rows.push({ label: 'Storage', value: text });
  }
  return rows;
}
