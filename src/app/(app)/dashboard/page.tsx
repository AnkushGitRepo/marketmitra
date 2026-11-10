import type { Metadata } from 'next';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import { getPortfolioValueHistories } from '@/lib/dashboard/portfolioHistory';
import { getIndices } from '@/lib/dashboard/fundamentalsApi';
import { getIpos } from '@/lib/dashboard/iposApi';
import { getTopMovers } from '@/lib/dashboard/quotes';
import { getUserAiConfig, resolveHasAiKey } from '@/lib/ai/userAiConfig';
import { getCachedInsight } from '@/lib/insights';
import { listNotifications } from '@/lib/notifications/store';
import { DashboardPageClient } from './DashboardPageClient';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your holdings, today’s movers, and market indices at a glance.',
};

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const userId = await getCurrentUserId();
  const holdings = userId ? await getEnrichedHoldings(userId) : [];
  const positions = holdings.map((h) => ({ symbol: h.symbol, quantity: h.quantity }));

  const [history, indices, movers, openIpos, notifications, hasKey, cachedInsight] = await Promise.all([
    getPortfolioValueHistories(positions),
    getIndices(),
    getTopMovers(),
    getIpos('open'),
    userId ? listNotifications(userId, 20) : Promise.resolve({ items: [], unread: 0 }),
    userId ? resolveHasAiKey(getUserAiConfig(userId)) : Promise.resolve(false),
    userId ? getCachedInsight('portfolio', 'portfolio', userId).catch(() => null) : Promise.resolve(null),
  ]);
  const alerts = notifications.items.filter((n) => n.kind === 'alert');

  return (
    <DashboardPageClient
      holdings={holdings}
      history={history}
      indices={indices ?? []}
      gainers={movers.gainers}
      losers={movers.losers}
      openIpos={openIpos}
      alerts={alerts}
      now={new Date()}
      hasAiKey={hasKey}
      insight={cachedInsight?.content ?? null}
    />
  );
}
