// Display helpers for the 360 brief's data panel. A missing figure is always "not available", never 0 or NaN.

export const NOT_AVAILABLE = 'not available';

const ok = (n: number | null): n is number => n !== null && Number.isFinite(n);

export const fmtPct = (n: number | null, digits = 1): string => (ok(n) ? `${n.toFixed(digits)}%` : NOT_AVAILABLE);
export const fmtTimes = (n: number | null, digits = 1): string => (ok(n) ? `${n.toFixed(digits)}x` : NOT_AVAILABLE);
export const fmtSigned = (n: number | null, digits = 1, suffix = ''): string =>
  ok(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(digits)}${suffix}` : NOT_AVAILABLE;
export const fmtCrore = (n: number | null): string =>
  ok(n) ? `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` : NOT_AVAILABLE;

/** Everything that is not promoter, FII or DII (public, government, others). */
export function otherHoldingPct(promoter: number | null, fii: number | null, dii: number | null): number | null {
  if (!ok(promoter) || !ok(fii) || !ok(dii)) return null;
  return Math.max(0, 100 - promoter - fii - dii);
}

/** Positions (0-100) of the P/E and the peer median on one bar, sharing a scale that leaves headroom. */
export function peBarPositions(pe: number | null, median: number | null): { pe: number; median: number } | null {
  if (!ok(pe) || !ok(median) || pe <= 0 || median <= 0) return null;
  const scale = Math.max(pe, median) * 1.25;
  return { pe: (pe / scale) * 100, median: (median / scale) * 100 };
}
