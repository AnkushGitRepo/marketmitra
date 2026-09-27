import type { Metadata } from 'next';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import { getPortfolioValueHistory } from '@/lib/dashboard/portfolioHistory';
import { getUserAiConfig, resolveHasAiKey } from '@/lib/ai/userAiConfig';
import { getCachedInsight } from '@/lib/insights';
import type { PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import { getNews } from '@/lib/dashboard/newsApi';
import { PortfolioPageClient } from './PortfolioPageClient';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Portfolio',
  description: 'Your holdings, live value, allocation, and unrealised P&L.',
};

export const dynamic = 'force-dynamic';

const PERIODS: PricePeriod[] = ['1mo', '6mo', '1y', '5y'];

export default async function PortfolioPage() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.chartSub}>Sign in to see your portfolio.</p>
      </div>
    );
  }

  const holdings = await getEnrichedHoldings(userId);
  const positions = holdings.map((h) => ({ symbol: h.symbol, quantity: h.quantity }));

  const historyByPeriod = Object.fromEntries(
    await Promise.all(PERIODS.map(async (p) => [p, await getPortfolioValueHistory(positions, p)] as const))
  ) as Record<PricePeriod, Awaited<ReturnType<typeof getPortfolioValueHistory>>>;

  const [hasKey, cachedInsight] = await Promise.all([
    resolveHasAiKey(getUserAiConfig(userId)),
    getCachedInsight('portfolio', 'portfolio', userId).catch(() => null),
  ]);
  const aiInsight = {
    hasKey,
    initial: cachedInsight
      ? { content: cachedInsight.content, generatedAt: cachedInsight.generatedAt.toISOString() }
      : null,
  };

  // News scoped to the holdings actually in this portfolio — same
  // `/api/news`-backing `getNews()` the News page's "My holdings" filter
  // uses, just always on here since this whole page is holdings-scoped.
  const holdingSymbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];
  const news = holdingSymbols.length > 0 ? await getNews({ symbols: holdingSymbols, limit: 8 }) : null;

  return (
    <PortfolioPageClient
      holdings={holdings}
      history={historyByPeriod}
      aiInsight={aiInsight}
      news={news?.items ?? []}
    />
  );
}
