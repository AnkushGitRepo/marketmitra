import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUserId } from '@/lib/currentUserId';
import { TaxHub } from '@/components/portfolio/TaxHub';
import { buildTaxReport } from '@/lib/tax/report';
import styles from '../page.module.css';

export const metadata: Metadata = {
  title: 'Tax & Harvesting',
  description: 'Short and long term gains on your holdings, the tax-free allowance and loss positions for the financial year.',
};

export const dynamic = 'force-dynamic';

export default async function PortfolioTaxPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.chartSub}>Sign in to see your tax view.</p>
      </div>
    );
  }

  const report = await buildTaxReport(userId, new Date()).catch(() => null);

  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}><Link href="/portfolio">Portfolio</Link> · Tax</p>
          <h1 className={styles.h1}>Tax &amp; Harvesting</h1>
        </div>
      </div>
      {report ? <TaxHub report={report} /> : <p className={styles.chartSub}>The tax view could not be built right now. Try again in a moment.</p>}
    </div>
  );
}
