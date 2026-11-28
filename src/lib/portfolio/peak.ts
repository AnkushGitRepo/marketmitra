export interface DatedClose {
  readonly trade_date: string;
  readonly close: string | null;
}

export interface PeakSincePurchase {
  readonly peak: number;
  /** ISO date of the highest close. */
  readonly peakDate: string;
  /** How far the live price is below that peak, in percent (0 at the peak, never negative). */
  readonly belowPeakPct: number;
}

/**
 * The highest daily close on or after the purchase date, and how far the price now sits below it. Needs a purchase
 * date: without one there is no "since you bought", so it returns null instead of guessing a window. The live price
 * counts as a close, so a stock trading above every past close reads as at its peak.
 */
export function peakSincePurchase(prices: readonly DatedClose[] | null, purchaseDate: string | null, ltp: number | null): PeakSincePurchase | null {
  if (!prices || !purchaseDate || ltp === null || !(ltp > 0)) return null;
  let peak = 0;
  let peakDate = '';
  for (const p of prices) {
    if (p.close === null || p.trade_date < purchaseDate) continue;
    const close = Number(p.close);
    if (Number.isFinite(close) && close > peak) {
      peak = close;
      peakDate = p.trade_date;
    }
  }
  if (peak === 0) return null;
  if (ltp >= peak) return { peak: ltp, peakDate, belowPeakPct: 0 };
  return { peak, peakDate, belowPeakPct: ((peak - ltp) / peak) * 100 };
}

/** "Peak ₹2,517 · 0.5% below" (or "At its peak ₹2,517"), a plain statement of where the price is against its high. */
export function peakLabel(peak: PeakSincePurchase, money: (v: number) => string): string {
  if (peak.belowPeakPct < 0.05) return `At its peak ${money(peak.peak)}`;
  return `Peak ${money(peak.peak)} · ${peak.belowPeakPct.toFixed(1)}% below`;
}
