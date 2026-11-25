import type { CellFormat, TableCell } from './blocks';

const LAKH = 100_000;
const DASH = '—';

const group = (n: number, digits = 0): string =>
  n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** ₹ crore amounts: ₹1,234 Cr, then ₹12.35L Cr from a lakh crore up. */
export function formatCrore(value: number | null): string {
  if (value === null) return DASH;
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  return abs >= LAKH ? `${sign}₹${group(abs / LAKH, 2)}L Cr` : `${sign}₹${group(Math.round(abs))} Cr`;
}

export const formatNumber = (value: number | null, digits = 1): string => (value === null ? DASH : group(value, digits));
export const formatPercent = (value: number | null, digits = 1): string => (value === null ? DASH : `${group(value, digits)}%`);
/** A ratio such as debt to equity or interest cover: 0.25x. */
export const formatMultiple = (value: number | null): string => (value === null ? DASH : `${group(value, 2)}x`);
export const formatRupee = (value: number | null): string => (value === null ? DASH : `₹${group(Math.round(value))}`);

const RUPEES_PER_LAKH = 100_000;
const RUPEES_PER_CRORE = 10_000_000;

/** A rupee amount in the Indian short form: ₹1,234, ₹1.23 L (lakh), ₹1.23 Cr (crore). */
export function formatRupeesShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= RUPEES_PER_CRORE) return `${sign}₹${group(abs / RUPEES_PER_CRORE, 2)} Cr`;
  if (abs >= RUPEES_PER_LAKH) return `${sign}₹${group(abs / RUPEES_PER_LAKH, 2)} L`;
  return `${sign}₹${group(Math.round(abs))}`;
}

export function formatCell(value: TableCell, format: CellFormat): string {
  if (value === null) return DASH;
  if (typeof value === 'string') return value;
  switch (format) {
    case 'crore':
      return formatCrore(value);
    case 'percent':
      return formatPercent(value);
    case 'rupee':
      return formatRupee(value);
    case 'number':
      return formatNumber(value);
    case 'multiple':
      return formatMultiple(value);
    case 'text':
      return String(value);
  }
}

/** The number a string figure from the data service holds, or null when it is empty or not a number. */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "Mar 26" for an ISO period end such as 2026-03-31. */
export function periodLabel(periodEnd: string): string {
  const [year, month] = periodEnd.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const name = names[Number(month) - 1];
  return name && year ? `${name} ${year.slice(2)}` : periodEnd;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
