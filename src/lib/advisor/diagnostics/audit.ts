import { concentration, sectorWeights, type HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import type { Limits } from './profiles';

export type LimitStatus = 'ok' | 'near' | 'over';

export interface LimitRow {
  readonly name: string;
  readonly pct: number;
  readonly limitPct: number;
  readonly status: LimitStatus;
}

export interface PortfolioAudit {
  readonly totalValue: number;
  readonly stocks: readonly LimitRow[];
  readonly sectors: readonly LimitRow[];
  readonly top3Pct: number;
  readonly unpricedCount: number;
  readonly alerts: readonly string[];
}

const NEAR_FRACTION = 0.8;
const UNCLASSIFIED = 'Other';

const statusFor = (pct: number, limit: number): LimitStatus => (pct > limit ? 'over' : pct >= limit * NEAR_FRACTION ? 'near' : 'ok');

/** Actual weights against the user's limits, from live holdings only. Pure. */
export function auditPortfolio(holdings: readonly HoldingLike[], limits: Limits): PortfolioAudit {
  const priced = holdings.filter((h) => h.ltp !== null);
  const unpricedCount = holdings.length - priced.length;
  const values = priced.map((h) => ({ name: h.symbol, value: h.quantity * (h.ltp ?? 0) }));
  const totalValue = values.reduce((sum, v) => sum + v.value, 0);
  if (totalValue <= 0) return { totalValue: 0, stocks: [], sectors: [], top3Pct: 0, unpricedCount, alerts: [] };

  const stocks: LimitRow[] = values
    .map((v) => {
      const pct = (v.value / totalValue) * 100;
      return { name: v.name, pct, limitPct: limits.maxStockPct, status: statusFor(pct, limits.maxStockPct) };
    })
    .sort((a, b) => b.pct - a.pct);

  const sectors: LimitRow[] = sectorWeights(holdings, Number.POSITIVE_INFINITY).map((s) => ({
    name: s.name,
    pct: s.pct,
    limitPct: limits.maxSectorPct,
    status: s.name === UNCLASSIFIED ? 'ok' : statusFor(s.pct, limits.maxSectorPct),
  }));

  const alerts = [
    ...stocks.filter((s) => s.status === 'over').map((s) => `${s.name} is ${s.pct.toFixed(1)}% of the portfolio against your ${s.limitPct}% single-stock limit.`),
    ...sectors.filter((s) => s.status === 'over').map((s) => `${s.name} is ${s.pct.toFixed(1)}% of the portfolio against your ${s.limitPct}% sector limit.`),
  ];

  return { totalValue, stocks, sectors, top3Pct: concentration(holdings).top3Pct, unpricedCount, alerts };
}
