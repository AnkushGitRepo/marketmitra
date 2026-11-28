'use client';

import Link from 'next/link';
import { useState } from 'react';
import { HoldingDrawer } from '@/components/portfolio/HoldingDrawer';
import type { PeakSincePurchase } from '@/lib/portfolio/peak';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import { HoldingRow } from '@/app/(app)/portfolio/HoldingRow';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import { filterCounts, filterHoldings, type HoldingFilter } from '@/lib/portfolio/portfolioMetrics';
import tableStyles from '@/app/(app)/portfolio/page.module.css';
import styles from './HoldingsSection.module.css';

interface HoldingsSectionProps {
  readonly holdings: readonly EnrichedHolding[];
  readonly totalValue: number;
  readonly masked: boolean;
  /** Stories shown in a holding's drawer. */
  readonly news: readonly NewsItem[];
  readonly peaks: Readonly<Record<string, PeakSincePurchase>>;
}

const CHIPS: readonly { readonly id: HoldingFilter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'profit', label: 'In Profit' },
  { id: 'loss', label: 'In Loss' },
];

/** The holdings table with All / In Profit / In Loss filter chips and live counts. */
export function HoldingsSection({ holdings, totalValue, masked, news, peaks }: HoldingsSectionProps) {
  const [filter, setFilter] = useState<HoldingFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = holdings.find((h) => h.id === openId) ?? null;
  const counts = filterCounts(holdings);
  const rows = filterHoldings(holdings, filter);

  return (
    <section className={tableStyles.holdingsCard} aria-label="Holdings">
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>Holdings</h2>
          <nav className={styles.related} aria-label="Related pages">
            <Link href="/portfolio/tax">Tax ↗</Link>
            <Link href="/portfolio/cash">Cash ↗</Link>
          </nav>
        </div>
        <div className={styles.chips} role="group" aria-label="Filter holdings">
          {CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={filter === c.id}
              className={`${styles.chip} ${filter === c.id ? styles.chipActive : ''}`}
              onClick={() => setFilter(c.id)}
            >
              {c.label} ({counts[c.id]})
            </button>
          ))}
        </div>
      </div>
      <div className={tableStyles.tableScroll}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th className={`${tableStyles.th} ${tableStyles.thLeft}`}>Company</th>
              <th className={`${tableStyles.th} ${tableStyles.thRight}`}>Qty</th>
              <th className={`${tableStyles.th} ${tableStyles.thRight}`}>Avg. price</th>
              <th className={`${tableStyles.th} ${tableStyles.thRight}`}>LTP</th>
              <th className={`${tableStyles.th} ${tableStyles.thRight}`}>Value / P&amp;L</th>
              <th className={`${tableStyles.th} ${tableStyles.thRight}`}>Allocation</th>
              <th className={tableStyles.th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <HoldingRow key={h.id} holding={h} totalValue={totalValue} masked={masked} peak={peaks[h.id] ?? null} onOpen={() => setOpenId(h.id)} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className={styles.empty}>No holdings match this filter.</p>}
      </div>
      {opened ? <HoldingDrawer holding={opened} news={news} peak={peaks[opened.id] ?? null} onClose={() => setOpenId(null)} /> : null}
    </section>
  );
}
