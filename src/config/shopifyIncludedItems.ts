import type { ShopifyAccessory } from '@/types/shopify';

export interface IncludedItemDefinition {
  id: string;
  label: string;
  quantity?: boolean;
  defaultIncluded?: boolean;
}

export type IncludedItemGroupKey =
  | 'laptop'
  | 'macbook'
  | 'iphone'
  | 'android_phone'
  | 'ipad'
  | 'android_tablet'
  | 'camera'
  | 'game_console'
  | 'nintendo_switch'
  | 'playstation'
  | 'xbox'
  | 'desktop'
  | 'monitor'
  | 'storage_drive'
  | 'networking'
  | 'smartwatch'
  | 'other';

export const SHOPIFY_INCLUDED_ITEMS: Record<IncludedItemGroupKey, IncludedItemDefinition[]> = {
  laptop: [
    { id: 'device', label: 'Laptop', defaultIncluded: true },
    { id: 'original-charger', label: 'Original Charger' },
    { id: 'replacement-charger', label: 'Replacement Charger' },
    { id: 'original-box', label: 'Original Box' },
    { id: 'laptop-bag', label: 'Laptop Bag' },
    { id: 'case', label: 'Case / Sleeve' },
    { id: 'dock', label: 'Dock' },
    { id: 'stylus', label: 'Stylus' },
    { id: 'manual', label: 'Manual / Paperwork' },
  ],
  macbook: [
    { id: 'device', label: 'MacBook', defaultIncluded: true },
    { id: 'original-charger', label: 'Original Apple Charger' },
    { id: 'replacement-charger', label: 'Replacement Charger' },
    { id: 'usb-cable', label: 'USB-C Cable' },
    { id: 'magsafe-cable', label: 'MagSafe Cable' },
    { id: 'original-box', label: 'Original Box' },
    { id: 'case', label: 'Case / Sleeve' },
    { id: 'adapter', label: 'Adapter / Dongle' },
  ],
  iphone: [
    { id: 'device', label: 'Apple iPhone', defaultIncluded: true },
    { id: 'original-cable', label: 'Original Apple Cable' },
    { id: 'replacement-cable', label: 'Replacement Cable' },
    { id: 'original-charger', label: 'Original Apple Charger' },
    { id: 'replacement-charger', label: 'Replacement Charger' },
    { id: 'original-box', label: 'Original Box' },
    { id: 'case', label: 'Case' },
    { id: 'screen-protector', label: 'Screen Protector' },
    { id: 'sim-tool', label: 'SIM Tool' },
  ],
  android_phone: [
    { id: 'device', label: 'Android Phone', defaultIncluded: true },
    { id: 'usb-cable', label: 'Original USB Cable' },
    { id: 'replacement-cable', label: 'Replacement USB Cable' },
    { id: 'original-charger', label: 'Original Charger' },
    { id: 'replacement-charger', label: 'Replacement Charger' },
    { id: 'original-box', label: 'Original Box' },
    { id: 'case', label: 'Case' },
    { id: 'screen-protector', label: 'Screen Protector' },
    { id: 'sim-tool', label: 'SIM Tool' },
    { id: 'stylus', label: 'S Pen' },
  ],
  ipad: [
    { id: 'device', label: 'Apple iPad', defaultIncluded: true },
    { id: 'usb-cable', label: 'USB-C / Lightning Cable' },
    { id: 'original-charger', label: 'Original Charger' },
    { id: 'replacement-charger', label: 'Replacement Charger' },
    { id: 'apple-pencil', label: 'Apple Pencil' },
    { id: 'keyboard', label: 'Keyboard' },
    { id: 'magic-keyboard', label: 'Magic Keyboard' },
    { id: 'original-box', label: 'Original Box' },
    { id: 'case', label: 'Case' },
  ],
  android_tablet: [
    { id: 'device', label: 'Tablet', defaultIncluded: true },
    { id: 'usb-cable', label: 'USB Cable' },
    { id: 'original-charger', label: 'Charger' },
    { id: 'stylus', label: 'Stylus' },
    { id: 'keyboard', label: 'Keyboard' },
    { id: 'original-box', label: 'Original Box' },
    { id: 'case', label: 'Case' },
  ],
  camera: [
    { id: 'device', label: 'Camera Body', defaultIncluded: true },
    { id: 'lens', label: 'Lens', quantity: true },
    { id: 'battery', label: 'Battery', quantity: true },
    { id: 'battery-charger', label: 'Battery Charger' },
    { id: 'usb-cable', label: 'USB Cable' },
    { id: 'camera-strap', label: 'Strap' },
    { id: 'lens-cap', label: 'Lens Cap' },
    { id: 'body-cap', label: 'Body Cap' },
    { id: 'memory-card', label: 'Memory Card' },
    { id: 'original-box', label: 'Original Box' },
    { id: 'camera-bag', label: 'Camera Bag' },
    { id: 'manual', label: 'Manual / Paperwork' },
  ],
  game_console: [
    { id: 'device', label: 'Console', defaultIncluded: true },
    { id: 'controller', label: 'Controller', quantity: true },
    { id: 'power-cable', label: 'Power Cable' },
    { id: 'hdmi-cable', label: 'HDMI Cable' },
    { id: 'usb-cable', label: 'USB Charging Cable' },
    { id: 'dock', label: 'Dock' },
    { id: 'stand', label: 'Stand' },
    { id: 'original-box', label: 'Original Box' },
    { id: 'game', label: 'Game' },
    { id: 'headset', label: 'Headset' },
  ],
  nintendo_switch: [
    { id: 'device', label: 'Console', defaultIncluded: true },
    { id: 'left-joycon', label: 'Left Joy-Con' },
    { id: 'right-joycon', label: 'Right Joy-Con' },
    { id: 'dock', label: 'Dock' },
    { id: 'joycon-grip', label: 'Joy-Con Grip' },
    { id: 'ac-adapter', label: 'AC Adapter' },
    { id: 'hdmi-cable', label: 'HDMI Cable' },
    { id: 'original-box', label: 'Original Box' },
  ],
  playstation: [
    { id: 'device', label: 'Console', defaultIncluded: true },
    { id: 'controller', label: 'DualSense / DualShock Controller', quantity: true },
    { id: 'power-cable', label: 'Power Cable' },
    { id: 'hdmi-cable', label: 'HDMI Cable' },
    { id: 'usb-cable', label: 'USB Cable' },
    { id: 'original-box', label: 'Original Box' },
  ],
  xbox: [
    { id: 'device', label: 'Console', defaultIncluded: true },
    { id: 'controller', label: 'Controller', quantity: true },
    { id: 'power-cable', label: 'Power Cable' },
    { id: 'hdmi-cable', label: 'HDMI Cable' },
    { id: 'original-box', label: 'Original Box' },
  ],
  desktop: [
    { id: 'device', label: 'Desktop Computer', defaultIncluded: true },
    { id: 'power-cable', label: 'Power Cable' },
    { id: 'wifi-antenna', label: 'Wi-Fi Antenna' },
    { id: 'keyboard', label: 'Keyboard' },
    { id: 'mouse', label: 'Mouse' },
    { id: 'original-box', label: 'Original Box' },
  ],
  monitor: [
    { id: 'device', label: 'Monitor', defaultIncluded: true },
    { id: 'stand', label: 'Stand' },
    { id: 'power-cable', label: 'Power Cable' },
    { id: 'power-adapter', label: 'Power Adapter' },
    { id: 'hdmi-cable', label: 'HDMI Cable' },
    { id: 'displayport-cable', label: 'DisplayPort Cable' },
    { id: 'usb-cable', label: 'USB Cable' },
    { id: 'original-box', label: 'Original Box' },
  ],
  storage_drive: [
    { id: 'device', label: 'Drive Only', defaultIncluded: true },
    { id: 'sata-cable', label: 'SATA Cable' },
    { id: 'usb-cable', label: 'USB Cable' },
    { id: 'enclosure', label: 'External Enclosure' },
    { id: 'power-adapter', label: 'Power Adapter' },
    { id: 'original-box', label: 'Original Box' },
  ],
  networking: [
    { id: 'device', label: 'Device', defaultIncluded: true },
    { id: 'power-adapter', label: 'Power Adapter' },
    { id: 'ethernet-cable', label: 'Ethernet Cable' },
    { id: 'antennas', label: 'Antennas' },
    { id: 'rack-ears', label: 'Rack Ears' },
    { id: 'mounting-hardware', label: 'Mounting Hardware' },
    { id: 'original-box', label: 'Original Box' },
  ],
  smartwatch: [
    { id: 'device', label: 'Watch', defaultIncluded: true },
    { id: 'charging-cable', label: 'Charging Cable' },
    { id: 'charging-dock', label: 'Charging Dock' },
    { id: 'watch-band', label: 'Watch Band' },
    { id: 'extra-band', label: 'Extra Band' },
    { id: 'original-box', label: 'Original Box' },
  ],
  other: [
    { id: 'device', label: 'Device', defaultIncluded: true },
    { id: 'original-box', label: 'Original Box' },
    { id: 'manual', label: 'Manual / Paperwork' },
    { id: 'power-cable', label: 'Power Cable' },
  ],
};

const CATEGORY_TO_GROUP: Record<string, IncludedItemGroupKey> = {
  'windows-laptop': 'laptop',
  laptop: 'laptop',
  macbook: 'macbook',
  'apple-iphone': 'iphone',
  iphone: 'iphone',
  smartphone: 'iphone',
  'android-phone': 'android_phone',
  ipad: 'ipad',
  'android-tablet': 'android_tablet',
  tablet: 'ipad',
  'digital-camera': 'camera',
  'dslr-camera': 'camera',
  'mirrorless-camera': 'camera',
  'action-camera': 'camera',
  camera: 'camera',
  'gaming-console': 'game_console',
  'windows-desktop': 'desktop',
  'custom-gaming-pc': 'desktop',
  desktop: 'desktop',
  monitor: 'monitor',
  hdd: 'storage_drive',
  ssd: 'storage_drive',
  'storage-drive': 'storage_drive',
  networking: 'networking',
  router: 'networking',
  smartwatch: 'smartwatch',
};

export function resolveIncludedItemGroup(
  categoryKey: string,
  brand = '',
  model = '',
): IncludedItemGroupKey {
  const blob = `${brand} ${model} ${categoryKey}`.toLowerCase();
  if (/switch|nintendo/.test(blob)) return 'nintendo_switch';
  if (/playstation|ps[1-5]|dualsense|dualshock/.test(blob)) return 'playstation';
  if (/\bxbox\b/.test(blob)) return 'xbox';
  if (/hard drive|hdd|ssd|solid state/.test(blob)) return 'storage_drive';
  if (/router|network|wifi ap|access point/.test(blob)) return 'networking';
  if (/watch|watchos|galaxy watch/.test(blob) && !/laptop/.test(blob)) return 'smartwatch';
  const key = String(categoryKey || '').trim().toLowerCase();
  return CATEGORY_TO_GROUP[key] || 'other';
}

export function includedItemDefinitions(
  categoryKey: string,
  brand = '',
  model = '',
): IncludedItemDefinition[] {
  const group = resolveIncludedItemGroup(categoryKey, brand, model);
  return SHOPIFY_INCLUDED_ITEMS[group];
}

export function includedItemIdsForGroup(group: IncludedItemGroupKey): string[] {
  return SHOPIFY_INCLUDED_ITEMS[group].map((item) => item.id);
}

function chargerWasIncluded(specs?: { accessories?: Array<{ id: string; included?: boolean; note?: string }>; chargerIncluded?: unknown } | Record<string, unknown>): boolean {
  if (!specs || typeof specs !== 'object') return false;
  const record = specs as Record<string, unknown>;
  if (/yes|true|included/i.test(String(record.chargerIncluded || ''))) return true;
  const accessories = Array.isArray(record.accessories) ? record.accessories as Array<{ id?: string; included?: boolean; note?: string }> : [];
  return accessories.some((item) => item.included && /charger|cable|adapter/i.test(`${item.id || ''} ${item.note || ''}`));
}

export function buildIncludedItems(options: {
  categoryKey: string;
  brand?: string;
  model?: string;
  specs?: Record<string, unknown>;
  previous?: ShopifyAccessory[];
}): ShopifyAccessory[] {
  const defs = includedItemDefinitions(options.categoryKey, options.brand, options.model);
  const previous = options.previous || [];
  const byId = new Map(previous.map((item) => [item.id, item]));
  const chargerIncluded = chargerWasIncluded(options.specs);
  const rows: ShopifyAccessory[] = defs.map((def) => {
    const prev = byId.get(def.id);
    const included = def.id === 'device'
      ? true
      : Boolean(prev?.included || (chargerIncluded && /charger|cable/i.test(def.id) && def.id !== 'replacement-charger' && def.id !== 'replacement-cable'));
    return {
      id: def.id,
      label: def.label,
      included,
      quantity: def.quantity ? (prev?.quantity || 1) : undefined,
    };
  });
  const allowed = new Set(defs.map((def) => def.id));
  const extras = previous.filter((item) => item.custom || (item.included && !allowed.has(item.id)));
  for (const extra of extras) {
    if (rows.some((row) => row.id === extra.id)) continue;
    rows.push({
      ...extra,
      orphan: extra.custom ? false : true,
    });
  }
  return rows;
}

export function mergeIncludedItemsForCategoryChange(
  current: ShopifyAccessory[],
  categoryKey: string,
  brand = '',
  model = '',
): ShopifyAccessory[] {
  return buildIncludedItems({
    categoryKey,
    brand,
    model,
    previous: current,
  });
}
