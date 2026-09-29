import type { Metadata } from 'next';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import { getPortfolioValueHistory } from '@/lib/dashboard/portfolioHistory';
import { getIndices, type PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import { getIpos } from '@/lib/dashboard/iposApi';
import { getTopMovers } from '@/lib/dashboard/quotes';
import { listNotifications } from '@/lib/notifications/store';
import { DashboardPageClient } from './DashboardPageClient';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your holdings, today’s movers, and market indices at a glance.',
};

export const dynamic = 'force-dynamic';

const PERIODS: PricePeriod[] = ['1mo', '6mo', '1y', '5y'];

export default async function DashboardPage() {
  const userId = await getCurrentUserId();
  const holdings = userId ? await getEnrichedHoldings(userId) : [];
  const positions = holdings.map((h) => ({ symbol: h.symbol, quantity: h.quantity }));

  const [historyEntries, indices, movers, openIpos, notifications] = await Promise.all([
    Promise.all(PERIODS.map(async (p) => [p, await getPortfolioValueHistory(positions, p)] as const)),
    getIndices(),
    getTopMovers(),
    getIpos('open'),
    userId ? listNotifications(userId, 20) : Promise.resolve({ items: [], unread: 0 }),
  ]);
  const activity = notifications.items.filter((n) => n.kind === 'alert' || n.kind === 'system').slice(0, 6);
  const history = Object.fromEntries(historyEntries) as Record<
    PricePeriod,
    Awaited<ReturnType<typeof getPortfolioValueHistory>>
  >;

  return (
    <DashboardPageClient
      holdings={holdings}
      history={history}
      indices={indices ?? []}
      gainers={movers.gainers}
      losers={movers.losers}
      openIpos={openIpos}
      activity={activity}
    />
  );
}
