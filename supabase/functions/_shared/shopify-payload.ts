const INTERNAL_KEYS = new Set([
  'imei', 'imei1', 'imei2', 'serialNumber', 'serial', 'serialImei',
  'cost', 'costPerUnit', 'staffNotes', 'employeeNotes',
]);

export function isInternalKey(key: string): boolean {
  const leaf = key.split('.').pop() || key;
  return INTERNAL_KEYS.has(key) || INTERNAL_KEYS.has(leaf);
}

export function sanitizeTags(tags: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tag = String(raw || '').trim();
    if (!tag || tag.length > 255) continue;
    if (isInternalKey(tag) || /\b(imei|serial number|cost)\b/i.test(tag)) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 250) break;
  }
  return out;
}

export function descriptionToHtml(description: string): string {
  const text = (description || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  const escape = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return text.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    const heading = lines[0].replace(/[─\-_=]{3,}/g, '').trim();
    const isHeading = lines.length > 1 && (/^[A-Z][A-Za-z /&]+$/.test(heading) || /^[─\-_=]{3,}$/.test(lines[1] || ''));
    if (isHeading) {
      const body = lines.slice(1).filter((l) => !/^[─\-_=]{3,}$/.test(l));
      const items = body.filter((l) => l.startsWith('•') || l.startsWith('-'));
      const paras = body.filter((l) => !l.startsWith('•') && !l.startsWith('-'));
      const list = items.length ? `<ul>${items.map((i) => `<li>${escape(i.replace(/^[•\-]\s*/, ''))}</li>`).join('')}</ul>` : '';
      return `<h3>${escape(heading)}</h3>${paras.map((p) => `<p>${escape(p)}</p>`).join('')}${list}`;
    }
    return `<p>${escape(lines.join(' '))}</p>`;
  }).join('');
}

function attr(attributes: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let cur: unknown = attributes;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[part];
  }
  const text = cur == null ? '' : String(cur).trim();
  if (!text || ['unknown', 'not applicable', 'n/a', 'na'].includes(text.toLowerCase())) return '';
  return text;
}

const METAFIELD_MAP: Array<{ key: string; metafield: string }> = [
  { key: 'cosmeticCondition', metafield: 'condition' },
  { key: 'cpu.model', metafield: 'cpu' },
  { key: 'cpu.family', metafield: 'cpu' },
  { key: 'gpu.model', metafield: 'gpu' },
  { key: 'ram.total', metafield: 'ram' },
  { key: 'storage.primaryCapacity', metafield: 'storage' },
  { key: 'display.size', metafield: 'screen_size' },
  { key: 'battery.health', metafield: 'battery_health' },
  { key: 'cameraType', metafield: 'camera_type' },
  { key: 'megapixels', metafield: 'megapixels' },
  { key: 'sensorSize', metafield: 'sensor_size' },
  { key: 'chip', metafield: 'apple_chip' },
];

export function publicMetafields(
  attributes: Record<string, unknown>,
  condition?: string,
): Array<{ namespace: string; key: string; type: string; value: string }> {
  const out: Array<{ namespace: string; key: string; type: string; value: string }> = [];
  const used = new Set<string>();
  if (condition?.trim()) {
    out.push({ namespace: 'paymore', key: 'condition', type: 'single_line_text_field', value: condition.trim() });
    used.add('condition');
  }
  for (const map of METAFIELD_MAP) {
    if (used.has(map.metafield) || isInternalKey(map.key)) continue;
    const value = attr(attributes || {}, map.key);
    if (!value) continue;
    out.push({ namespace: 'paymore', key: map.metafield, type: 'single_line_text_field', value: value.slice(0, 255) });
    used.add(map.metafield);
  }
  return out.filter((f) => !isInternalKey(f.key));
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function parseDataUrl(value: string): { mime: string; bytes: Uint8Array; filename: string } | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1] || 'image/jpeg';
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return { mime, bytes, filename: `listing-${Date.now()}.${ext}` };
}

export function holdingComplete(acquiredAt: string, requiredDays: number): boolean {
  if (!acquiredAt || requiredDays <= 0) return true;
  const acquired = new Date(acquiredAt);
  if (Number.isNaN(acquired.getTime())) return true;
  const days = Math.floor((Date.now() - acquired.getTime()) / 86_400_000);
  return days >= requiredDays;
}

export function barcodeForShopify(barcode: string | null | undefined): string {
  const value = String(barcode || '').trim();
  if (!value) return '';
  if (/imei|serial/i.test(value)) return '';
  if (/^\d{15,17}$/.test(value)) return '';
  return value;
}
