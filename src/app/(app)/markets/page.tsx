import type { Metadata } from 'next';
import { AiBriefCard } from '@/components/dashboard-charts/AiBriefCard';
import { IndexStrip } from '@/components/dashboard-charts/IndexStrip';
import { BreadthCard } from '@/components/markets/BreadthCard';
import { SectorPerformanceCard } from '@/components/markets/SectorPerformanceCard';
import { WatchlistPanel } from '@/components/markets/WatchlistPanel';
import { DataUnavailable } from '@/components/common/DataUnavailable';
import { getUserAiConfig, resolveHasAiKey } from '@/lib/ai/userAiConfig';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getIndices, getPrices } from '@/lib/dashboard/fundamentalsApi';
import { getQuotes, type Quote } from '@/lib/dashboard/quotes';
import { getCachedInsight } from '@/lib/insights';
import { getMarketOverview } from '@/lib/markets/marketOverview';
import { listHoldings } from '@/lib/holdings';
import { listWishlists, type UserWishlist } from '@/lib/wishlists/userWishlists';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Markets',
  description: 'Indices, market breadth, sector performance and your watchlists.',
};

export const dynamic = 'force-dynamic';

/** Rows with a trend line. Bounded so a huge watchlist cannot fan out into dozens of price requests. */
const MAX_SPARKLINES = 40;

async function recentCloses(symbol: string): Promise<readonly number[] | null> {
  const points = await getPrices(symbol, '1mo').catch(() => null);
  if (!points) return null;
  const closes = points.map((p) => (p.close === null ? NaN : Number(p.close))).filter((c) => Number.isFinite(c));
  return closes.length >= 2 ? closes.reverse() : null; // the API returns newest first
}

export default async function MarketsPage() {
  const userId = await getCurrentUserId();

  let watchlists: UserWishlist[] = [];
  if (userId) {
    try {
      watchlists = await listWishlists(userId);
    } catch {
      // Mongo unreachable: render the shell with no watchlists rather than 500.
    }
  }

  // Holdings form a managed list; if they cannot be read the other lists still render.
  const holdings = userId ? await listHoldings(userId).catch(() => []) : [];

  const allSymbols = Array.from(new Set([...watchlists.flatMap((w) => w.symbols), ...holdings.map((h) => h.symbol)]));
  const [indices, overview, quoteList, sparkEntries, hasKey, cachedPulse] = await Promise.all([
    getIndices(),
    getMarketOverview(),
    allSymbols.length > 0 ? getQuotes(allSymbols) : Promise.resolve<Quote[]>([]),
    Promise.all(allSymbols.slice(0, MAX_SPARKLINES).map(async (s) => [s, await recentCloses(s)] as const)),
    userId ? resolveHasAiKey(getUserAiConfig(userId)) : Promise.resolve(false),
    userId ? getCachedInsight('market', 'market', userId).catch(() => null) : Promise.resolve(null),
  ]);
  const quotes = Object.fromEntries(quoteList.map((q) => [q.symbol, q]));
  const sparks = Object.fromEntries(
    sparkEntries.flatMap(([symbol, closes]) => (closes ? [[symbol, closes] as const] : []))
  );

  return (
    <div className={styles.pageRoot}>
      <div className={styles.head}>
        <p className={styles.eyebrow}>Live market data</p>
        <h1 className={styles.h1}>Markets</h1>
      </div>

      <div className={styles.grid}>
        <div className={styles.indices}>
          {indices && indices.length > 0 ? (
            <IndexStrip indices={indices} showMarketsLink={false} />
          ) : (
            <DataUnavailable>Index data is temporarily unavailable. The data service may be offline.</DataUnavailable>
          )}
        </div>

        <div className={styles.breadth}>
          <BreadthCard breadth={overview.breadth} />
        </div>

        <div className={styles.watch}>
          {userId ? (
            <WatchlistPanel watchlists={watchlists} quotes={quotes} sparks={sparks} holdings={holdings} />
          ) : (
            <p className={styles.eyebrow}>Sign in to build your own watchlists.</p>
          )}
        </div>

        <div className={styles.sectors}>
          <SectorPerformanceCard sectors={overview.sectors} />
        </div>

        <div className={styles.pulse}>
          <AiBriefCard
            title="Mitra Market Pulse"
            endpoint="/api/insights/market"
            initial={cachedPulse?.content ?? null}
            hasKey={hasKey}
            emptyText="No read yet. Ask Mitra for two sentences on how the market is trading today."
            noKeyText="to get a two-sentence read on how the market is trading. MarketMitra charges nothing for it."
          />
        </div>
      </div>
    </div>
  );
}
