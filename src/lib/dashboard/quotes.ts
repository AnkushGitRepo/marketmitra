import { getCompany, getQuotes as getFundamentalsQuotes } from './fundamentalsApi';
import { WATCHLIST } from './watchlist';

export interface Quote {
  symbol: string;
  name: string;
  sector: string | null;
  price: number;
  change: number;
  changePct: number;
}

/** A real live quote (ADR 0024: yahoo-finance2, falling back to the
 * fundamentals-api's NSE/BSE chain) for one symbol, enriched with the
 * company's name/sector. Returns null if a live price wasn't available —
 * callers must skip it, not fall back to a stale close or fake it. */
export async function getQuote(symbol: string, displayName?: string): Promise<Quote | null> {
  const [company, [quote]] = await Promise.all([getCompany(symbol), getFundamentalsQuotes([symbol])]);
  if (!quote?.price) return null;

  const price = Number(quote.price);
  const prevClose = quote.prev_close != null ? Number(quote.prev_close) : null;
  const changePct = quote.change_pct != null ? Number(quote.change_pct) : null;

  return {
    symbol,
    name: displayName ?? company?.name ?? symbol,
    sector: company?.sector ?? null,
    price,
    change: prevClose != null ? price - prevClose : 0,
    changePct: changePct ?? 0,
  };
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const [companies, quotes] = await Promise.all([
    Promise.all(symbols.map((s) => getCompany(s))),
    getFundamentalsQuotes(symbols),
  ]);
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));

  return symbols
    .map((symbol, i) => {
      const quote = quoteBySymbol.get(symbol.toUpperCase());
      if (!quote?.price) return null;
      const price = Number(quote.price);
      const prevClose = quote.prev_close != null ? Number(quote.prev_close) : null;
      const changePct = quote.change_pct != null ? Number(quote.change_pct) : null;
      return {
        symbol,
        name: companies[i]?.name ?? symbol,
        sector: companies[i]?.sector ?? null,
        price,
        change: prevClose != null ? price - prevClose : 0,
        changePct: changePct ?? 0,
      };
    })
    .filter((q): q is Quote => q !== null);
}

export async function getWatchlistQuotes(): Promise<Quote[]> {
  const quotes = await Promise.all(WATCHLIST.map((w) => getQuote(w.symbol, w.name)));
  return quotes.filter((q): q is Quote => q !== null);
}

export async function getTopMovers(): Promise<{ gainers: Quote[]; losers: Quote[] }> {
  const quotes = await getWatchlistQuotes();
  const sorted = [...quotes].sort((a, b) => b.changePct - a.changePct);
  return {
    gainers: sorted.filter((q) => q.changePct > 0).slice(0, 5),
    losers: sorted
      .filter((q) => q.changePct < 0)
      .slice(-5)
      .reverse(),
  };
}
