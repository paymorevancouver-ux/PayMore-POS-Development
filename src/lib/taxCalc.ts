import type { TaxMode } from '@/types';
import { GST_RATE, PST_RATE } from '@/constants/config';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateLineTax(amount: number, taxMode: TaxMode) {
  const gst = ['both', 'gst-only'].includes(taxMode) ? round2(amount * GST_RATE) : 0;
  const pst = ['both', 'pst-only'].includes(taxMode) ? round2(amount * PST_RATE) : 0;
  return { gst, pst, total: round2(amount + gst + pst) };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function generateCode(prefix: string): string {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  return `${prefix}-${dateStr}-${seq}`;
}

// ── Device Code Generation (store-aware, 6-digit padded) ──
// Each store has its own independent numbering sequence and prefix.
// Examples: BC01-000001 (Surrey) | BC05-000001 (Vancouver)

const STORE_DEVICE_PREFIX_MAP: Record<string, string> = {
  'STR-001': 'BC01', // Paymore Surrey
  'STR-002': 'BC05', // Paymore Vancouver
};

export function getStoreDeviceCodePrefix(storeId: string): string {
  return STORE_DEVICE_PREFIX_MAP[storeId] || 'BC00';
}

// Per-store next-number counter (in-memory cache, persisted to DB on each insert)
const _nextDeviceNums: Record<string, number> = {};

export function setNextDeviceNumber(storeId: string, n: number): void {
  _nextDeviceNums[storeId] = n;
}

export function getNextDeviceNumber(storeId: string): number {
  return _nextDeviceNums[storeId] || 1;
}

export function generateDeviceCode(storeId: string): string {
  const prefix = getStoreDeviceCodePrefix(storeId);
  const num = _nextDeviceNums[storeId] || 1;
  _nextDeviceNums[storeId] = num + 1;
  return `${prefix}-${String(num).padStart(6, '0')}`;
}

/** Extract numeric portion from any device code (DEV-, BC01-, BC05-, etc.) */
export function parseDeviceCodeNumber(code: string): number {
  const m = code.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

export function generateCustomerCode(): string {
  return `C-${String(Math.floor(Math.random() * 99999) + 10000)}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-CA', {
    hour: '2-digit', minute: '2-digit',
  });
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
