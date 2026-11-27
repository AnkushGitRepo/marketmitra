import type { Metadata } from 'next';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import { getPortfolioValueHistories } from '@/lib/dashboard/portfolioHistory';
import { fetchIndexHistory } from '@/lib/dashboard/yahooQuote';
import { slicePricesByPeriod } from '@/lib/dashboard/pricePeriods';
import { alignToDates } from '@/lib/portfolio/compare';
import type { PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import { listBullion } from '@/lib/bullion/store';
import { valueBullion } from '@/lib/bullion/value';
import { getCommodities } from '@/lib/commodities/getCommodities';
import { getNews } from '@/lib/dashboard/newsApi';
import { RISK_PROFILES } from '@/lib/onboarding/profiles';
import { getPreferences } from '@/lib/preferences/store';
import { PortfolioPageClient } from './PortfolioPageClient';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Portfolio',
  description: 'Your holdings, live value, allocation, and unrealised P&L.',
};

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.chartSub}>Sign in to see your portfolio.</p>
      </div>
    );
  }

  const [holdings, prefs] = await Promise.all([getEnrichedHoldings(userId), getPreferences(userId)]);
  const profile = prefs.onboarding.riskProfile;
  const positions = holdings.map((h) => ({ symbol: h.symbol, quantity: h.quantity }));

  const [historyByPeriod, niftyHistory] = await Promise.all([getPortfolioValueHistories(positions), fetchIndexHistory('NIFTY 50', '5y')]);
  // Nifty 50 closes lined up with each range's dates, so the chart compares like with like (null = no data, the overlay hides).
  const benchmark = Object.fromEntries(
    (Object.keys(historyByPeriod) as PricePeriod[]).map((period) => {
      const dates = historyByPeriod[period].d ?? [];
      const closes = slicePricesByPeriod(niftyHistory, period).flatMap((p) => (p.close === null ? [] : [{ date: p.trade_date, close: Number(p.close) }]));
      return [period, closes.length > 1 ? alignToDates(dates, closes) : []];
    })
  ) as Record<PricePeriod, (number | null)[]>;

  // Physical metals (#454): an estimated value for the allocation donut. Optional context, so a failure just means no slice.
  const [bullionEntries, commodities] = await Promise.all([listBullion(userId).catch(() => []), getCommodities().catch(() => null)]);
  const metalsValue = bullionEntries.length > 0 ? valueBullion(bullionEntries, commodities).totalValue : 0;

  // News scoped to the holdings actually in this portfolio — same
  // `/api/news`-backing `getNews()` the News page's "My holdings" filter
  // uses, just always on here since this whole page is holdings-scoped.
  const holdingSymbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];
  const news = holdingSymbols.length > 0 ? await getNews({ symbols: holdingSymbols, limit: 8 }) : null;

  return (
    <PortfolioPageClient
      holdings={holdings}
      history={historyByPeriod}
      benchmark={benchmark}
      news={news?.items ?? []}
      metalsValue={metalsValue}
      maxPositionPct={profile ? RISK_PROFILES[profile].maxPositionPct : null}
    />
  );
}
