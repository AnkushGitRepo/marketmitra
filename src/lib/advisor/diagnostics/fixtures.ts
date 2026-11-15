import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';

const holding = (symbol: string, sector: string | null, quantity: number, avgPrice: number, ltp: number | null): HoldingLike => ({
  symbol,
  name: symbol,
  quantity,
  avgPrice,
  ltp,
  sector,
  dayChange: null,
});

/** Total value 1,000: AAA 400 (Financials), BBB 200 (Financials), CCC 300 (Health), DDD 100 (IT, down 70%). */
export const HOLDINGS: readonly HoldingLike[] = [
  holding('AAA', 'Financials', 4, 50, 100),
  holding('BBB', 'Financials', 2, 100, 100),
  holding('CCC', 'Health', 3, 50, 100),
  holding('DDD', 'IT', 1, 333.33, 100),
];
