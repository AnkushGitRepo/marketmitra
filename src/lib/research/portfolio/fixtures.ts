// A small book for the portfolio report's tests: two winners, three losers of different depth, one unpriced holding.
import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import { toPositions, type HoldingFacts, type Position } from './analysis';

export const fundamentals = (symbol: string, over: Partial<ScreenerResultRow> = {}): ScreenerResultRow =>
  ({ symbol, name: symbol, sector: 'Financial Services', industry: 'Banks', market_cap: 50_000, pe: 18, pb: 2, roce: 14, roe: 12, debt_to_equity: 0.4, sales_growth_3y_cagr: 11, profit_growth_3y_cagr: 9, ...over }) as ScreenerResultRow;

const h = (symbol: string, qty: number, avg: number, ltp: number | null, sector: string, over: Partial<ScreenerResultRow> = {}): HoldingFacts => ({
  symbol, name: `${symbol} Ltd`, sector, quantity: qty, avgPrice: avg, ltp, fundamentals: fundamentals(symbol, { sector, ...over }), volatilityPct: 28,
});

export const book = (): Position[] =>
  toPositions([
    h('LAURUSLABS', 20, 300, 780, 'Healthcare', { industry: 'Drug Manufacturers' }),
    h('PNB', 100, 60, 105, 'Financial Services'),
    h('LATENTVIEW', 10, 540, 193, 'Technology', { industry: 'Information Technology Services', pe: -4 }),
    h('BANDHANBNK', 50, 200, 118, 'Financial Services'),
    h('HDFCLIFE', 10, 700, 681, 'Financial Services', { industry: 'Insurance' }),
    h('IGL', 30, 400, 266, 'Utilities', { industry: 'Gas Utilities' }),
  ]);
