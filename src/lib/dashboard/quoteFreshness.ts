// Whether a Yahoo quote is a live price. Yahoo keeps serving dead lines: in a trial of the NSE SME platform, the plain
// `SYMBOL.NS` ticker answered for about half of the symbols with a price last traded on 2024-07-23 (84% were more than
// 25% off NSE's price), while the series-suffixed `SYMBOL-SM.NS` was live and accurate. A quote that old is not a
// price "right now" and must never be shown as one (ADR 0066). Pure; the clock is passed in.

export const MAX_QUOTE_AGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
// Anything below this is epoch seconds, not milliseconds.
const EPOCH_SECONDS_LIMIT = 1e12;

/** When the quote was last traded, from whichever form Yahoo gave it in, or null. */
export function quoteTime(quote: Record<string, unknown>): Date | null {
  const raw = quote.regularMarketTime;
  const date = raw instanceof Date ? raw : typeof raw === 'number' && Number.isFinite(raw) ? new Date(raw < EPOCH_SECONDS_LIMIT ? raw * 1000 : raw) : typeof raw === 'string' ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** False for a quote older than `maxAgeDays`. A quote with no time cannot be judged, so it is kept. */
export function isFreshQuote(quote: Record<string, unknown>, now: Date = new Date(), maxAgeDays: number = MAX_QUOTE_AGE_DAYS): boolean {
  const at = quoteTime(quote);
  return at === null || now.getTime() - at.getTime() <= maxAgeDays * DAY_MS;
}
