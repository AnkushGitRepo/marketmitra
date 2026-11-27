'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AllocationCard } from '@/components/portfolio/AllocationCard';
import { HoldingsSection } from '@/components/portfolio/HoldingsSection';
import { PortfolioNews } from '@/components/portfolio/PortfolioNews';
import { PortfolioHero } from '@/components/portfolio/PortfolioHero';
import { RiskCopilotCard } from '@/components/portfolio/RiskCopilotCard';
import { useMask } from '@/lib/dashboard/MaskContext';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import type { PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import type { RangeSeries } from '@/lib/dashboard/chartMath';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import { portfolioTotals } from '@/lib/portfolio/portfolioMetrics';
import { AddHoldingForm } from './AddHoldingForm';
import styles from './page.module.css';

interface PortfolioPageClientProps {
  holdings: EnrichedHolding[];
  history: Record<PricePeriod, RangeSeries>;
  news: NewsItem[];
  /** The single-stock limit from the chosen risk profile (ADR 0075); null when none was chosen. */
  maxPositionPct: number | null;
}

function exportCsv(holdings: EnrichedHolding[]) {
  const header = ['Symbol', 'Quantity', 'Avg Price', 'LTP', 'Value', 'Unrealized P&L'];
  const rows = holdings.map((h) => {
    const value = h.ltp !== null ? h.quantity * h.ltp : '';
    const pl = h.ltp !== null ? h.quantity * (h.ltp - h.avgPrice) : '';
    return [h.symbol, h.quantity, h.avgPrice, h.ltp ?? '', value, pl].join(',');
  });
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'marketmitra-holdings.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function PortfolioPageClient({ holdings, history, news, maxPositionPct }: PortfolioPageClientProps) {
  const router = useRouter();
  const { masked } = useMask();
  const [showAddForm, setShowAddForm] = useState(holdings.length === 0);

  if (holdings.length === 0) {
    return (
      <div className={styles.pageRoot}>
        <div className={styles.headRow}>
          <div>
            <p className={styles.eyebrow}>Your holdings</p>
            <h1 className={styles.h1}>Portfolio</h1>
          </div>
        </div>
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>No holdings yet</p>
          <p className={styles.chartSub}>Add your first position to see live value, allocation, and P&amp;L.</p>
          <AddHoldingForm onDone={() => router.refresh()} />
        </div>
      </div>
    );
  }

  const totals = portfolioTotals(holdings);

  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Your holdings · live prices</p>
          <h1 className={styles.h1}>Portfolio</h1>
        </div>
        <div className={styles.headActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => exportCsv(holdings)}>
            Export CSV
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => setShowAddForm((s) => !s)}>
            {showAddForm ? 'Cancel' : 'Add position'}
          </button>
        </div>
      </div>

      {showAddForm && <AddHoldingForm onDone={() => setShowAddForm(false)} />}

      {/* Four blocks, one rhythm: the stack's gap is the only spacing between them. */}
      <div className={styles.stack}>
        <PortfolioHero totals={totals} history={history} masked={masked} />

        <div className={styles.macroGrid}>
          <AllocationCard holdings={holdings} />
          <RiskCopilotCard holdings={holdings} maxPositionPct={maxPositionPct} />
        </div>

        <HoldingsSection holdings={holdings} totalValue={totals.totalValue} masked={masked} />

        <section aria-label="News for your holdings">
          <div className={styles.sectionHeadRow}>
            <h2 className={styles.h2}>News for your holdings</h2>
            <Link href="/news" className={styles.btnSecondary}>
              View all news
            </Link>
          </div>
          <div className={styles.newsCard}>
            <PortfolioNews items={news} holdings={holdings} />
          </div>
        </section>
      </div>
    </div>
  );
}
