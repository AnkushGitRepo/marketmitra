import type { Metadata } from 'next';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import { getPortfolioValueHistories } from '@/lib/dashboard/portfolioHistory';
import { getNews } from '@/lib/dashboard/newsApi';
import { RISK_PROFILES } from '@/lib/onboarding/profiles';
import { listCash } from '@/lib/cash/store';
import { getPreferences } from '@/lib/preferences/store';
import { listSnapshots } from '@/lib/tradeJournal/store';
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

  // Cash is optional context: if it cannot be read, the rest of the page still renders.
  const [holdings, prefs, cash] = await Promise.all([getEnrichedHoldings(userId), getPreferences(userId), listCash(userId).catch(() => [])]);
  const profile = prefs.onboarding.riskProfile;
  const positions = holdings.map((h) => ({ symbol: h.symbol, quantity: h.quantity }));

  const historyByPeriod = await getPortfolioValueHistories(positions);

  // News scoped to the holdings actually in this portfolio — same
  // `/api/news`-backing `getNews()` the News page's "My holdings" filter
  // uses, just always on here since this whole page is holdings-scoped.
  const holdingSymbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];
  const news = holdingSymbols.length > 0 ? await getNews({ symbols: holdingSymbols, limit: 8 }) : null;

  // Journal: a failed read leaves the rest of the page intact.
  const journal = await listSnapshots(userId).catch(() => []);
  const journalPrices = Object.fromEntries(holdings.map((h) => [h.symbol.toUpperCase(), h.ltp]));

  return (
    <PortfolioPageClient
      holdings={holdings}
      history={historyByPeriod}
      news={news?.items ?? []}
      cash={cash}
      journal={journal}
      journalPrices={journalPrices}
      maxPositionPct={profile ? RISK_PROFILES[profile].maxPositionPct : null}
    />
  );
}
