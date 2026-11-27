import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUserId } from '@/lib/currentUserId';
import { CashHub } from '@/components/portfolio/CashHub';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import { listCash } from '@/lib/cash/store';
import styles from '../page.module.css';

export const metadata: Metadata = {
  title: 'Cash & Liquid Funds',
  description: 'Cash and liquid funds beside your stocks, and a what-if rebalance sandbox.',
};

export const dynamic = 'force-dynamic';

export default async function PortfolioCashPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.chartSub}>Sign in to see your cash.</p>
      </div>
    );
  }

  // Cash is optional context: if it cannot be read the page still shows the stocks and the sandbox.
  const [holdings, cash] = await Promise.all([getEnrichedHoldings(userId), listCash(userId).catch(() => [])]);

  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}><Link href="/portfolio">Portfolio</Link> · Cash</p>
          <h1 className={styles.h1}>Cash &amp; Liquid Funds</h1>
        </div>
      </div>
      <CashHub holdings={holdings} cash={cash} />
    </div>
  );
}
