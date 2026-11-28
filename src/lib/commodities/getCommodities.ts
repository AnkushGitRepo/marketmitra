// Server only: fetches the futures, the rupee rate and the ETF quotes, then builds the precious-metals view (ADR 0086).

import { fetchYahooTicker } from '@/lib/dashboard/yahooQuote';
import type { QuoteOut } from '@/lib/dashboard/fundamentalsApi';
import { type MetalId } from './convert';
import { FUTURES, METAL_ETFS, USDINR_TICKER, buildCommodities, type CommoditiesData, type RawQuote } from './rates';

/** Prices move through the day but a card does not need every second; this also spares the unofficial Yahoo endpoint. */
export const CACHE_MS = 5 * 60_000;

const num = (v: string | null): number | null => {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function toRaw(q: QuoteOut | null): RawQuote | null {
  if (!q) return null;
  return { price: num(q.price), changePct: num(q.change_pct), week52High: num(q.week52_high), week52Low: num(q.week52_low), asOf: q.as_of };
}

let cached: { readonly at: number; readonly data: CommoditiesData } | null = null;

/** The view, from a five-minute cache. Never throws: a source that is down leaves its figures null. */
export async function getCommodities(now: number = Date.now()): Promise<CommoditiesData> {
  if (cached && now - cached.at < CACHE_MS) return cached.data;

  const metalIds = Object.keys(FUTURES) as MetalId[];
  const [fx, futs, etfs] = await Promise.all([
    fetchYahooTicker(USDINR_TICKER),
    Promise.all(metalIds.map((m) => fetchYahooTicker(FUTURES[m]))),
    Promise.all(METAL_ETFS.map((e) => fetchYahooTicker(`${e.symbol}.NS`))),
  ]);
  const data = buildCommodities({
    usdInr: toRaw(fx),
    futures: Object.fromEntries(metalIds.map((m, i) => [m, toRaw(futs[i])])) as Record<MetalId, RawQuote | null>,
    etfs: Object.fromEntries(METAL_ETFS.map((e, i) => [e.symbol, toRaw(etfs[i])])),
  });
  // A view with no prices at all is not worth keeping for five minutes.
  if (data.metals.some((m) => m.priceInr !== null)) cached = { at: now, data };
  return data;
}
