// Display formatting for fund figures. A missing figure is a dash, never 0.

export const DASH = '—';

export type Tone = 'up' | 'down' | 'flat';

interface PercentOptions {
  /** Prefix positive values with "+" (default true). */
  signed?: boolean;
}

export function formatPercent(value: number | null, { signed = true }: PercentOptions = {}): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  const fixed = Math.abs(value).toFixed(2);
  if (value < 0 && Number(fixed) !== 0) return `-${fixed}%`;
  return `${signed && value > 0 && Number(fixed) !== 0 ? '+' : ''}${fixed}%`;
}

export function formatNumber(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  // A value that rounds to zero is zero: never "-0.00".
  if (Number(value.toFixed(digits)) === 0) value = 0;
  return value.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatNav(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

/** AUM arrives in ₹ crore. */
export function formatAum(crore: number | null): string {
  if (crore === null || !Number.isFinite(crore)) return DASH;
  return `₹${Math.round(crore).toLocaleString('en-IN')} Cr`;
}

/** Tone follows the figure as displayed (2 decimals), so a "0.00%" is never red or green. */
export function returnTone(value: number | null): Tone {
  if (value === null || !Number.isFinite(value) || Number(value.toFixed(2)) === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

export function formatDate(iso: string | null): string {
  if (!iso) return DASH;
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}
