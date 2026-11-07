import type { AnnualYear, ScreenData } from './types';

// Offline fixtures for the screen tests — no network. `year(n)` builds a
// healthy fiscal year n steps back from FY2026; override fields to break a gate.
export function year(back: number, over: Partial<AnnualYear> = {}): AnnualYear {
  const growth = 1.1 ** (6 - back);
  return {
    periodEnd: `${2026 - back}-03-31`,
    sales: 1000 * growth,
    netProfit: 150 * growth,
    profitBeforeTax: 200 * growth,
    interest: 10,
    eps: 10 * growth,
    borrowings: 100,
    equityCapital: 50,
    reserves: 650,
    freeCashFlow: 80,
    priceAtYearEnd: 150 * growth,
    ...over,
  };
}

export function healthy(over: Partial<ScreenData> = {}): ScreenData {
  return {
    symbol: 'GOODCO',
    sector: 'Consumer Goods',
    asOf: '2026-11-07',
    annual: [0, 1, 2, 3, 4, 5].map((b) => year(b)),
    promoter: [
      { quarterEnd: '2026-09-30', pct: 60 },
      { quarterEnd: '2026-06-30', pct: 60 },
      { quarterEnd: '2026-03-31', pct: 60 },
      { quarterEnd: '2025-12-31', pct: 60 },
      { quarterEnd: '2025-09-30', pct: 60 },
    ],
    reportedRocePct: 28,
    currentPe: 12,
    promoterPledgePct: 0,
    ...over,
  };
}
