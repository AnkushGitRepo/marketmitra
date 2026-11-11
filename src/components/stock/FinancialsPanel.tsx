'use client';

import { useState } from 'react';
import { PillTabs } from '@/components/dashboard-charts/PillTabs';
import type { FinTable } from '@/lib/dashboard/transforms';
import { MOBILE_PERIODS, recentColumns } from '@/lib/stock/finView';
import { useIsMobile } from './useIsMobile';
import styles from './DeepDive.module.css';

export type StatementKey = 'profit_and_loss' | 'balance_sheet' | 'cash_flow';

const FIN_TABS: StatementKey[] = ['profit_and_loss', 'balance_sheet', 'cash_flow'];
const FIN_LABELS: Record<StatementKey, string> = { profit_and_loss: 'P&L', balance_sheet: 'Balance sheet', cash_flow: 'Cash flow' };

interface FinancialsPanelProps {
  readonly financials: Record<StatementKey, FinTable>;
}

/** Annual statements (the data source has no quarterly series, so there is no Quarterly switch). The metric column stays put while the years scroll. */
export function FinancialsPanel({ financials }: FinancialsPanelProps) {
  const [statement, setStatement] = useState<StatementKey>('profit_and_loss');
  const [showAll, setShowAll] = useState(false);
  const isMobile = useIsMobile();
  const full = financials[statement];
  const limited = isMobile && !showAll;
  const table = recentColumns(full, limited ? MOBILE_PERIODS : 'all');
  const hidden = full.cols.length - table.cols.length;

  return (
    <div>
      <div className={styles.finHead}>
        <p className={styles.note}>Annual · ₹ crore</p>
        <PillTabs options={FIN_TABS} value={statement} onChange={setStatement} labels={FIN_LABELS} />
      </div>
      {table.rows.length > 0 ? (
        <>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {table.cols.map((label, i) => (
                    <th key={i} scope="col" className={i === 0 ? styles.stickyHead : styles.numHead}>
                      {i === 0 ? 'Metric' : label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className={styles.stickyCell}>
                      {row.label}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td key={i} className={styles.numCell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isMobile && (hidden > 0 || showAll) && (
            <button type="button" className={styles.linkBtn} onClick={() => setShowAll((v) => !v)}>
              {showAll ? `Show latest ${MOBILE_PERIODS} years` : `Show all ${full.cols.length - 1} years`}
            </button>
          )}
        </>
      ) : (
        <p className={styles.note}>No {FIN_LABELS[statement].toLowerCase()} data available for this company yet.</p>
      )}
    </div>
  );
}
