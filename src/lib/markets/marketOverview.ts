import { fetchYahooQuoteChunk, fetchYahooTickerQuotes } from '@/lib/dashboard/yahooQuote';
import { createTtlCache } from './ttlCache';
import {
  NIFTY50_SYMBOLS,
  SECTOR_INDICES,
  computeBreadth,
  rankSectors,
  type Breadth,
  type SectorMove,
} from './marketPulse';

export interface MarketOverview {
  readonly breadth: Breadth | null;
  readonly sectors: readonly SectorMove[];
  readonly asOf: string;
}

const CACHE_TTL_MS = 60_000;
const cache = createTtlCache<MarketOverview>(CACHE_TTL_MS);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function load(): Promise<MarketOverview> {
  const [constituents, sectorQuotes] = await Promise.all([
    fetchYahooQuoteChunk([...NIFTY50_SYMBOLS]),
    fetchYahooTickerQuotes(SECTOR_INDICES.map((s) => s.ticker)),
  ]);

  const changes = constituents.map((q) => num(q.regularMarketChangePercent)).filter((c): c is number => c !== null);

  const byTicker = new Map(sectorQuotes.map((q) => [String(q.symbol), num(q.regularMarketChangePercent)]));
  const sectors = SECTOR_INDICES.flatMap(({ label, ticker }) => {
    const changePct = byTicker.get(ticker) ?? null;
    return changePct === null ? [] : [{ label, changePct }];
  });

  return { breadth: computeBreadth(changes), sectors: rankSectors(sectors), asOf: new Date().toISOString() };
}

/** NIFTY 50 breadth and sector performance from live Yahoo quotes, cached for a minute per server instance. Never throws. */
export async function getMarketOverview(): Promise<MarketOverview> {
  try {
    return await cache.get('overview', load);
  } catch {
    return { breadth: null, sectors: [], asOf: new Date().toISOString() };
  }
}
