'use client';

import { useRouter } from 'next/navigation';
import { HeroPortfolioCard } from '@/components/dashboard-charts/HeroPortfolioCard';
import { IndexStrip } from '@/components/dashboard-charts/IndexStrip';
import { MoverPanel } from '@/components/dashboard-charts/MoverPanel';
import { IpoOpenCard } from '@/components/dashboard-charts/IpoOpenCard';
import { CriticalAlertsCard } from '@/components/dashboard-charts/CriticalAlertsCard';
import { StructuredBriefCard } from '@/components/dashboard-charts/StructuredBriefCard';
import { useMask } from '@/lib/dashboard/MaskContext';
import type { IndexQuoteOut, PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import type { Ipo } from '@/lib/dashboard/iposApi';
import type { Quote } from '@/lib/dashboard/quotes';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import type { RangeSeries } from '@/lib/dashboard/chartMath';
import type { Notification } from '@/lib/notifications/types';
import styles from './page.module.css';

interface DashboardPageClientProps {
  holdings: EnrichedHolding[];
  history: Record<PricePeriod, RangeSeries>;
  indices: IndexQuoteOut[];
  gainers: Quote[];
  losers: Quote[];
  openIpos: Ipo[];
  alerts: Notification[];
  now: Date;
  hasAiKey: boolean;
  insight: string | null;
}

export function DashboardPageClient({
  holdings,
  history,
  indices,
  gainers,
  losers,
  openIpos,
  alerts,
  now,
  hasAiKey,
  insight,
}: DashboardPageClientProps) {
  const router = useRouter();
  const { masked } = useMask();

  const priced = holdings.filter((h) => h.ltp !== null);
  const totalValue = priced.reduce((sum, h) => sum + h.quantity * h.ltp!, 0);
  const invested = holdings.reduce((sum, h) => sum + h.quantity * h.avgPrice, 0);
  const todayChange = priced.reduce((sum, h) => sum + h.quantity * (h.dayChange ?? 0), 0);

  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Live data</p>
          <h1 className={styles.h1}>Dashboard</h1>
        </div>
        <div className={styles.headActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => router.push('/portfolio')}>
            Manage holdings
          </button>
        </div>
      </div>

      <IndexStrip indices={indices} />

      {/* Wrappers become 70/30 columns on desktop; on phones `display: contents` lets `order` interleave their children. */}
      <div className={styles.layout}>
        <div className={styles.mainCol}>
          {holdings.length === 0 ? (
            <div className={styles.emptyPortfolioCard}>
              <p className={styles.emptyTitle}>No holdings yet</p>
              <p className={styles.statSub}>Add a position on the Portfolio page to see live value and P&amp;L here.</p>
              <button type="button" className={styles.btnPrimary} onClick={() => router.push('/portfolio')}>
                Go to Portfolio
              </button>
            </div>
          ) : (
            <div className={styles.heroSlot}>
              <HeroPortfolioCard
                totalValue={totalValue}
                invested={invested}
                todayChange={todayChange}
                history={history}
                masked={masked}
              />
            </div>
          )}
          <div className={styles.moverGrid}>
            <MoverPanel title="Top gainers (watchlist)" rows={gainers} />
            <MoverPanel title="Top losers (watchlist)" rows={losers} />
          </div>
        </div>

        <aside className={styles.sideCol}>
          <div className={styles.alertsSlot}>
            <CriticalAlertsCard items={alerts} now={now} />
          </div>
          <div className={styles.briefSlot}>
            <StructuredBriefCard
              surface="dashboard"
              title="AI Daily Brief"
              endpoint="/api/insights/portfolio"
              initial={insight}
              hasKey={hasAiKey}
              emptyText="No brief yet. Ask Mitra for today's return driver, exposure and risk trigger."
              noKeyText="to get a three-point brief of what moved your portfolio. MarketMitra charges nothing for it."
              chatPrompt="Walk me through what moved my portfolio today and which holdings matter most."
            />
          </div>
          <div className={styles.ipoSlot}>
            <IpoOpenCard openIpos={openIpos} />
          </div>
        </aside>
      </div>
    </div>
  );
}
