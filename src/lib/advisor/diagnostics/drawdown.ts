import { holdingReturnPct, type HoldingLike } from '@/lib/portfolio/portfolioMetrics';

export interface DrawdownRow {
  readonly symbol: string;
  readonly name: string;
  readonly returnPct: number;
  readonly lossINR: number;
  readonly weightPct: number;
}

export const DEFAULT_DRAWDOWN_PCT = 30;

/** Holdings down at least `thresholdPct` on cost, worst first. */
export function reviewDrawdowns(holdings: readonly HoldingLike[], thresholdPct: number = DEFAULT_DRAWDOWN_PCT): DrawdownRow[] {
  const total = holdings.reduce((sum, h) => sum + (h.ltp === null ? 0 : h.quantity * h.ltp), 0);
  return holdings
    .map((h) => ({ h, r: holdingReturnPct(h) }))
    .filter((x): x is { h: HoldingLike; r: number } => x.r !== null && x.r <= -thresholdPct)
    .map(({ h, r }) => ({
      symbol: h.symbol,
      name: h.name,
      returnPct: r,
      lossINR: h.quantity * h.avgPrice - h.quantity * (h.ltp ?? 0),
      weightPct: total > 0 ? ((h.quantity * (h.ltp ?? 0)) / total) * 100 : 0,
    }))
    .sort((a, b) => a.returnPct - b.returnPct);
}
