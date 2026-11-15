import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';

export type StressScenario =
  | { readonly kind: 'market'; readonly fallPct: number }
  | { readonly kind: 'sector'; readonly sector: string; readonly fallPct: number };

export interface StressResult {
  readonly totalValue: number;
  readonly lossINR: number;
  readonly lossPct: number;
  readonly tolerancePct: number;
  readonly withinTolerance: boolean;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What the current holdings would lose if the scenario happened. Arithmetic on today's values, not a forecast. */
export function stressTest(holdings: readonly HoldingLike[], scenario: StressScenario, tolerancePct: number): StressResult {
  const priced = holdings.filter((h) => h.ltp !== null);
  const value = (h: HoldingLike) => h.quantity * (h.ltp ?? 0);
  const totalValue = priced.reduce((sum, h) => sum + value(h), 0);
  const hit = priced.filter((h) => scenario.kind === 'market' || (h.sector !== null && same(h.sector, scenario.sector)));
  const lossINR = hit.reduce((sum, h) => sum + value(h), 0) * (scenario.fallPct / 100);
  const lossPct = totalValue > 0 ? (lossINR / totalValue) * 100 : 0;
  return { totalValue, lossINR, lossPct, tolerancePct, withinTolerance: lossPct <= tolerancePct + 1e-9 };
}
