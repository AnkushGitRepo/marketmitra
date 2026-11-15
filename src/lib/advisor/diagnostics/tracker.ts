import { holdingReturnPct, type HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import type { AnalystStatus, ThesisCriterion } from '@/lib/analysts/types';

export type ThesisStatus = 'intact' | 'review' | 'pending' | 'none';

export interface AnalystView {
  readonly symbol: string;
  readonly status: AnalystStatus;
  readonly hasDossier: boolean;
  readonly criteria: readonly ThesisCriterion[] | null;
}

export interface TrackerRow {
  readonly symbol: string;
  readonly name: string;
  readonly avgPrice: number;
  readonly ltp: number | null;
  readonly returnPct: number | null;
  readonly thesis: ThesisStatus;
}

function thesisFor(analyst: AnalystView | undefined): ThesisStatus {
  if (!analyst) return 'none';
  if (!analyst.hasDossier) return 'pending';
  return analyst.criteria?.some((c) => c.enabled && c.breached) ? 'review' : 'intact';
}

/** One row per holding, synced from the holding itself and its analyst; no manual entry. */
export function trackerRows(holdings: readonly HoldingLike[], analysts: readonly AnalystView[]): TrackerRow[] {
  const bySymbol = new Map(analysts.map((a) => [a.symbol.toUpperCase(), a]));
  return holdings.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    avgPrice: h.avgPrice,
    ltp: h.ltp,
    returnPct: holdingReturnPct(h),
    thesis: thesisFor(bySymbol.get(h.symbol.toUpperCase())),
  }));
}
