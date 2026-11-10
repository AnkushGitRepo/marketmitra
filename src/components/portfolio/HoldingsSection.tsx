'use client';

import { useState } from 'react';
import { HoldingRow } from '@/app/(app)/portfolio/HoldingRow';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import { filterCounts, filterHoldings, type HoldingFilter } from '@/lib/portfolio/portfolioMetrics';
import tableStyles from '@/app/(app)/portfolio/page.module.css';
import styles from './HoldingsSection.module.css';

interface HoldingsSectionProps {
  readonly holdings: readonly EnrichedHolding[];
  readonly totalValue: number;
  readonly masked: boolean;
}

const CHIPS: readonly { readonly id: HoldingFilter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'profit', label: 'In Profit' },
  { id: 'loss', label: 'In Loss' },
];

/** The holdings table with All / In Profit / In Loss filter chips and live counts. */
export function HoldingsSection({ holdings, totalValue, masked }: HoldingsSectionProps) {
  const [filter, setFilter] = useState<HoldingFilter>('all');
  const counts = filterCounts(holdings);
  const rows = filterHoldings(holdings, filter);

  return (
    <section className={tableStyles.holdingsCard} aria-label="Holdings">
      <div className={styles.head}>
        <h2 className={styles.title}>Holdings</h2>
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
              <HoldingRow key={h.id} holding={h} totalValue={totalValue} masked={masked} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className={styles.empty}>No holdings match this filter.</p>}
      </div>
    </section>
  );
}
