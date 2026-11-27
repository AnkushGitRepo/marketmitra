'use client';

import { AllocationCard } from '@/components/portfolio/AllocationCard';
import { CashManager } from '@/components/portfolio/CashManager';
import { RebalanceSandbox } from '@/components/portfolio/RebalanceSandbox';
import { formatInr } from '@/lib/dashboard/format';
import { useMask } from '@/lib/dashboard/MaskContext';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import { totalCash, type CashEntry } from '@/lib/cash/schema';
import { cashSummary } from '@/lib/cash/summary';
import { portfolioTotals } from '@/lib/portfolio/portfolioMetrics';
import styles from './CashHub.module.css';

interface CashHubProps {
  readonly holdings: EnrichedHolding[];
  readonly cash: CashEntry[];
}

/** The cash page body: the equity and cash mix, the cash entries, and the what-if sandbox. */
export function CashHub({ holdings, cash }: CashHubProps) {
  const { masked } = useMask();
  const cashTotal = totalCash(cash);
  const summary = cashSummary(portfolioTotals(holdings).totalValue, cashTotal);
  const money = (n: number) => formatInr(n, 0, masked);

  return (
    <div className={styles.root}>
      <dl className={styles.strip}>
        <div className={styles.tile}><dt>Total value (stocks and cash)</dt><dd>{money(summary.total)}</dd></div>
        <div className={styles.tile}><dt>Stocks</dt><dd>{money(summary.equity)}</dd><span>{summary.equityPct.toFixed(1)}% of the total</span></div>
        <div className={styles.tile}><dt>Cash and liquid funds</dt><dd>{money(summary.cash)}</dd><span>{summary.cashPct.toFixed(1)}% of the total</span></div>
      </dl>

      <div className={styles.grid}>
        <AllocationCard holdings={holdings} cash={cashTotal} includeCash />
        <CashManager entries={cash} />
      </div>

      <RebalanceSandbox holdings={holdings} cash={cashTotal} />
    </div>
  );
}
