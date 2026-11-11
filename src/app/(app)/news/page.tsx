import { AiBriefCard } from '@/components/dashboard-charts/AiBriefCard';
import { InfoPopover } from '@/components/common/InfoPopover';
import { TrendingTickers, type TrendingRow } from '@/components/news/TrendingTickers';
import { getUserAiConfig, resolveHasAiKey } from '@/lib/ai/userAiConfig';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getQuotes } from '@/lib/dashboard/fundamentalsApi';
import { getNews } from '@/lib/dashboard/newsApi';
import { listHoldings } from '@/lib/holdings';
import { getCachedInsight } from '@/lib/insights';
import { trendingTickers } from '@/lib/news/feed';
import { NewsFeedClient } from './NewsFeedClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const FEED_PAGE = 50;
const TRENDING_LIMIT = 5;

async function dayChanges(symbols: string[]): Promise<Map<string, number>> {
  if (symbols.length === 0) return new Map();
  const quotes = await getQuotes(symbols).catch(() => []);
  return new Map(
    quotes.flatMap((q) => {
      const pct = q.change_pct === null ? NaN : Number(q.change_pct);
      return Number.isFinite(pct) ? [[q.symbol.toUpperCase(), pct] as const] : [];
    })
  );
}

export default async function NewsPage() {
  const userId = await getCurrentUserId();

  let holdingSymbols: string[] = [];
  if (userId) {
    try {
      holdingSymbols = [...new Set((await listHoldings(userId)).map((h) => h.symbol.toUpperCase()))];
    } catch {
      holdingSymbols = [];
    }
  }

  const initial = await getNews({ limit: FEED_PAGE });
  const trending = trendingTickers(initial.items, new Date(), { limit: TRENDING_LIMIT });

  const [changes, hasKey, cachedPulse] = await Promise.all([
    dayChanges(trending.map((t) => t.symbol)),
    userId ? resolveHasAiKey(getUserAiConfig(userId)) : Promise.resolve(false),
    userId ? getCachedInsight('news', 'news', userId).catch(() => null) : Promise.resolve(null),
  ]);
  const rows: TrendingRow[] = trending.map((t) => ({ ...t, changePct: changes.get(t.symbol) ?? null }));

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>News</p>
      <div className={styles.titleRow}>
        <h1 className={styles.h1}>Markets news</h1>
        <InfoPopover label="About this news feed">
          <p>
            Headlines from Indian markets outlets and Google News, newest first. Topics are tagged automatically from
            headline keywords.
          </p>
          <p>
            The Positive / Negative / Neutral badge is a rough <em>headline tone</em> read (VADER) of the wording. It is
            not analysis and not a signal: a negative headline is not a call on the stock.
          </p>
        </InfoPopover>
      </div>

      <div className={styles.grid}>
        <div className={styles.trending}>
          <TrendingTickers rows={rows} />
        </div>
        <div className={styles.pulse}>
          <AiBriefCard
            title="Mitra news pulse"
            endpoint="/api/insights/news"
            initial={cachedPulse?.content ?? null}
            hasKey={hasKey}
            emptyText="No read yet. Ask Mitra for two sentences on what today's headlines are mostly about."
            noKeyText="to get a two-sentence read on today's headlines. MarketMitra charges nothing for it."
          />
        </div>
        <div className={styles.feed}>
          <NewsFeedClient initial={initial} holdingSymbols={holdingSymbols} />
        </div>
      </div>
    </div>
  );
}
