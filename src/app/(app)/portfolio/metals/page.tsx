import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUserId } from '@/lib/currentUserId';
import { BullionManager } from '@/components/portfolio/BullionManager';
import { listBullion } from '@/lib/bullion/store';
import { valueBullion } from '@/lib/bullion/value';
import { getCommodities } from '@/lib/commodities/getCommodities';
import styles from '../page.module.css';

export const metadata: Metadata = {
  title: 'Gold, Silver & Platinum',
  description: 'Physical metal you hold, valued at an estimated Indian price.',
};

export const dynamic = 'force-dynamic';

export default async function PortfolioMetalsPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.chartSub}>Sign in to see your metals.</p>
      </div>
    );
  }

  // Prices are optional context: without them the entries still show, with "No price" instead of a value.
  const [entries, commodities] = await Promise.all([listBullion(userId).catch(() => []), getCommodities().catch(() => null)]);
  const summary = valueBullion(entries, commodities);

  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}><Link href="/portfolio">Portfolio</Link> · Metals</p>
          <h1 className={styles.h1}>Gold, Silver &amp; Platinum</h1>
        </div>
        <Link href="/markets?view=bullion" className={styles.btnSecondary}>Live metal prices</Link>
      </div>
      <BullionManager summary={summary} assumptions={commodities?.assumptions ?? null} />
    </div>
  );
}
