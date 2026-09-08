/**
 * Barcode generation utilities for inventory labels.
 * Uses JsBarcode (Code128) for SVG/Canvas rendering.
 * Uses jsPDF for PDF download generation.
 */
import type { InventoryItem } from '@/types';
import { formatCurrency } from '@/lib/taxCalc';
import { isReusableRetailBarcode } from '@/lib/shopify/retailBarcode';

// ─── Lazy module loading ───
let _jsBarcodeMod: typeof import('jsbarcode') | null = null;
async function getJsBarcode() {
  if (!_jsBarcodeMod) _jsBarcodeMod = await import('jsbarcode');
  return _jsBarcodeMod.default || _jsBarcodeMod;
}

// ─── Helpers ───

/** Compute the full product code (optionally with location suffix appended) */
export function buildProductCode(item: InventoryItem, includeLocation = true): string {
  if (!includeLocation || !item.storageLocation) return item.deviceCode;
  const locClean = item.storageLocation.replace(/-/g, '');
  return `${item.deviceCode}-${locClean}`;
}

/** Value encoded in the barcode graphic: the shared POS/Shopify retail barcode only. */
export function labelBarcodeValue(item: InventoryItem, opts?: { appendLocation?: boolean; encodeBarcode?: string }): string {
  const override = String(opts?.encodeBarcode || '').trim();
  if (override) return override;
  if (isReusableRetailBarcode(item.barcode, { deviceCode: item.deviceCode, serialImei: item.serialImei })) {
    return String(item.barcode);
  }
  return '';
}

export function labelHeadline(item: InventoryItem, opts?: { appendLocation?: boolean; encodeBarcode?: string }): string {
  return item.deviceCode;
}

/** Build a short description string for label (truncated with ...) */
export function buildDescription(
  item: InventoryItem,
  maxLen = 40,
  opts?: { price?: number; title?: string; includeLocation?: boolean },
): string {
  let desc = String(opts?.title || `${item.brand} ${item.model}`).trim();
  if (!opts?.title && item.category) desc += ` · ${item.category}`;
  const price = opts?.price ?? item.expectedSalePrice;
  if (Number(price) > 0) desc += ` · ${formatCurrency(Number(price))}`;
  if (opts?.includeLocation && item.storageLocation) desc += ` · ${item.storageLocation}`;
  if (desc.length > maxLen) desc = desc.substring(0, maxLen - 3) + '...';
  return desc;
}

// ─── Barcode rendering ───

/** Generate Code128 barcode as SVG markup string */
export async function generateBarcodeSvg(
  value: string,
  options?: { width?: number; height?: number; format?: 'CODE128' | 'UPC' }
): Promise<string> {
  if (!value) return '';
  const JsBarcode = await getJsBarcode();
  const xmlns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(xmlns, 'svg');
  try {
    JsBarcode(svg as unknown as SVGElement, value, {
      format: options?.format || (/^\d{12}$/.test(value) ? 'UPC' : 'CODE128'),
      width: options?.width ?? 1.8,
      height: options?.height ?? 50,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return new XMLSerializer().serializeToString(svg);
  } catch {
    try {
      JsBarcode(svg as unknown as SVGElement, value, {
        format: 'CODE128',
        width: options?.width ?? 1.8,
        height: options?.height ?? 50,
        displayValue: false,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return new XMLSerializer().serializeToString(svg);
    } catch (e) {
      console.error('[Barcode] SVG generation error:', e);
      return '';
    }
  }
}

/** Generate Code128 barcode as PNG data URL (for PDF embedding) */
export async function generateBarcodeDataUrl(
  value: string,
  options?: { width?: number; height?: number; format?: 'CODE128' | 'UPC' }
): Promise<string> {
  if (!value) return '';
  const JsBarcode = await getJsBarcode();
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, value, {
      format: options?.format || (/^\d{12}$/.test(value) ? 'UPC' : 'CODE128'),
      width: options?.width ?? 2,
      height: options?.height ?? 70,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch {
    try {
      JsBarcode(canvas, value, {
        format: 'CODE128',
        width: options?.width ?? 2,
        height: options?.height ?? 70,
        displayValue: false,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('[Barcode] Canvas generation error:', e);
      return '';
    }
  }
}

// ─── Print HTML generation ───

export interface PrintLabelOptions {
  appendLocation?: boolean;
  encodeBarcode?: string;
  price?: number;
  title?: string;
}

/** Build complete HTML for printing one or more product labels */
export async function buildLabelHtml(
  items: InventoryItem[],
  opts?: PrintLabelOptions
): Promise<string> {
  const appendLocation = opts?.appendLocation ?? true;
  const labels = await Promise.all(
    items.map(async (item) => {
      const code = labelHeadline(item, { appendLocation, encodeBarcode: opts?.encodeBarcode });
      const bars = labelBarcodeValue(item, { appendLocation, encodeBarcode: opts?.encodeBarcode });
      const barcodeSvg = await generateBarcodeSvg(bars, { width: 1.4, height: 40 });
      const desc = buildDescription(item, 48, {
        price: opts?.price,
        title: opts?.title,
        includeLocation: appendLocation,
      });
      return `
<div class="label">
  <div class="code">${escapeHtml(code)}</div>
  <div class="barcode">${barcodeSvg}</div>
  <div class="desc">${escapeHtml(desc)}</div>
</div>`;
    })
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Product Labels</title>
<style>
@page { size: 2in 1in; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: #ffffff; color: #000000; font-family: Arial, Helvetica, sans-serif; }
body { width: 2in; }
.label {
  width: 2in;
  height: 1in;
  padding: 3px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  color: #000000;
  overflow: hidden;
  page-break-after: always;
}
.label:last-child { page-break-after: auto; }
.code {
  font-size: 12pt;
  font-weight: 900;
  font-family: 'Courier New', monospace;
  text-align: center;
  letter-spacing: 0.5px;
  line-height: 1;
  margin: 0 0 1px 0;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #000000;
}
.barcode {
  width: 96%;
  height: 0.40in;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 1px 0;
}
.barcode svg {
  width: 100%;
  height: 100%;
  display: block;
}
.desc {
  font-size: 6.5pt;
  font-weight: 500;
  text-align: center;
  line-height: 1;
  margin: 1px 0 0 0;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #000000;
}
</style>
</head>
<body>
${labels.join('')}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Print/Download Actions ───

/** Print labels via hidden iframe (works on thermal & standard printers) */
export async function printLabels(items: InventoryItem[], opts?: PrintLabelOptions): Promise<void> {
  if (items.length === 0) return;
  const html = await buildLabelHtml(items, opts);

  const old = document.getElementById('product-label-print-frame');
  if (old) old.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'product-label-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    console.error('[Label] Cannot access iframe document');
    return;
  }
  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  await new Promise((r) => setTimeout(r, 500));
  try {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } catch (e) {
    console.error('[Label] Print error:', e);
  }
  setTimeout(() => {
    try { iframe.remove(); } catch { /* noop */ }
  }, 5000);
}

/** Download labels as multi-page PDF using jsPDF */
export async function downloadLabelsPdf(
  items: InventoryItem[],
  opts?: PrintLabelOptions & { filename?: string }
): Promise<void> {
  if (items.length === 0) return;
  const appendLocation = opts?.appendLocation ?? true;
  const jspdfMod = await import('jspdf');
  const PDFClass = (jspdfMod.jsPDF || jspdfMod.default) as typeof jspdfMod.jsPDF;

  const pdf = new PDFClass({ unit: 'in', format: [2, 1], orientation: 'landscape' });

  for (let i = 0; i < items.length; i++) {
    if (i > 0) pdf.addPage([2, 1], 'landscape');
    const item = items[i];
    const code = labelHeadline(item, { appendLocation, encodeBarcode: opts?.encodeBarcode });
    const bars = labelBarcodeValue(item, { appendLocation, encodeBarcode: opts?.encodeBarcode });
    const desc = buildDescription(item, 48, {
      price: opts?.price,
      title: opts?.title,
      includeLocation: appendLocation,
    });
    const barcodeDataUrl = await generateBarcodeDataUrl(bars, { width: 2, height: 70 });

    // Line 1: Product Code (centered, top)
    pdf.setFont('courier', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(0, 0, 0);
    pdf.text(code, 1, 0.18, { align: 'center', baseline: 'middle' });

    // Line 2: Barcode (centered)
    if (barcodeDataUrl) {
      try {
        pdf.addImage(barcodeDataUrl, 'PNG', 0.06, 0.30, 1.88, 0.45);
      } catch (e) {
        console.error('[PDF] Barcode embed error:', e);
      }
    }

    // Line 3: Description (small, centered, bottom)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.text(desc, 1, 0.88, { align: 'center', baseline: 'middle' });
  }

  const filename =
    opts?.filename ??
    (items.length === 1 ? `label-${items[0].deviceCode}.pdf` : `labels-${items.length}items-${Date.now()}.pdf`);
  pdf.save(filename);
}
