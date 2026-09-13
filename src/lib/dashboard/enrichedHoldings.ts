import { listHoldings, type Holding } from '@/lib/holdings';
import { getCompany, getQuotes } from './fundamentalsApi';

export interface EnrichedHolding extends Holding {
  name: string;
  sector: string | null;
  ltp: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
}

/** Merges MongoDB-stored holdings with a real live quote (ADR 0024:
 * yahoo-finance2, falling back to the fundamentals-api's NSE/BSE chain).
 * `ltp`/`dayChange*` are null when a live quote couldn't be fetched (both
 * sources offline, unrecognized symbol) — UI must show that honestly rather
 * than fall back to a stale end-of-day close or a fabricated price. */
export async function getEnrichedHoldings(userId: string): Promise<EnrichedHolding[]> {
  let holdings: Holding[];
  try {
    holdings = await listHoldings(userId);
  } catch {
    return [];
  }

  const [companies, quotes] = await Promise.all([
    Promise.all(holdings.map((h) => getCompany(h.symbol))),
    getQuotes(holdings.map((h) => h.symbol)),
  ]);
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));

  return holdings.map((h, i) => {
    const company = companies[i];
    const quote = quoteBySymbol.get(h.symbol.toUpperCase());
    const price = quote?.price != null ? Number(quote.price) : null;
    const prevClose = quote?.prev_close != null ? Number(quote.prev_close) : null;
    return {
      ...h,
      name: company?.name ?? h.symbol,
      sector: company?.sector ?? null,
      ltp: price,
      dayChange: price != null && prevClose != null ? price - prevClose : null,
      dayChangePct: quote?.change_pct != null ? Number(quote.change_pct) : null,
    };
  });
}
