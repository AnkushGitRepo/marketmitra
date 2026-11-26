// Loads what the portfolio report needs (#390): the holdings, each one's row in the data service and its one-year price volatility.
// The data service is passed in so this tests without a network; a holding with no row or no history just has those figures null.

import type { ScreenerFilters, ScreenerPage, ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import { annualisedVolatility, toPositions, type HoldingFacts, type Position } from './analysis';

export interface PortfolioGetters {
  readonly holdings: () => Promise<readonly EnrichedHolding[]>;
  readonly page: (filters: ScreenerFilters) => Promise<ScreenerPage>;
  /** Closing prices over the last year, oldest first; null when none could be fetched. */
  readonly closes: (symbol: string) => Promise<readonly number[] | null>;
}

/** The report covers this many holdings; a larger book is cut to its biggest by cost, and the report says so. */
export const MAX_HOLDINGS = 25;

export interface PortfolioInputs {
  readonly positions: readonly Position[];
  /** Holdings left out because the book is larger than the report covers. */
  readonly omitted: number;
}

const rowFor = async (g: PortfolioGetters, symbol: string): Promise<ScreenerResultRow | null> => {
  try {
    const page = await g.page({ q: symbol, board: 'all', limit: 10 });
    return page.rows.find((r) => r.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
  } catch {
    return null;
  }
};

const volatilityFor = async (g: PortfolioGetters, symbol: string): Promise<number | null> => {
  try {
    const closes = await g.closes(symbol);
    return closes ? annualisedVolatility(closes) : null;
  } catch {
    return null;
  }
};

/** Null when the user holds nothing. */
export async function gatherPortfolioInputs(g: PortfolioGetters): Promise<PortfolioInputs | null> {
  const all = await g.holdings();
  if (all.length === 0) return null;
  const chosen = [...all].sort((a, b) => b.avgPrice * b.quantity - a.avgPrice * a.quantity).slice(0, MAX_HOLDINGS);
  const facts: HoldingFacts[] = await Promise.all(
    chosen.map(async (h) => {
      const [fundamentals, volatilityPct] = await Promise.all([rowFor(g, h.symbol), volatilityFor(g, h.symbol)]);
      return { symbol: h.symbol, name: h.name, sector: h.sector ?? fundamentals?.sector ?? null, quantity: h.quantity, avgPrice: h.avgPrice, ltp: h.ltp, fundamentals, volatilityPct };
    }),
  );
  return { positions: toPositions(facts), omitted: all.length - chosen.length };
}
