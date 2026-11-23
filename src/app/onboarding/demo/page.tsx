import Link from 'next/link';
import { RiskCopilotCard } from '@/components/portfolio/RiskCopilotCard';
import { DEMO_HOLDINGS } from '@/lib/onboarding/demoPortfolio';
import { RISK_PROFILES } from '@/lib/onboarding/profiles';
import styles from './demo.module.css';

export const metadata = { title: 'Demo portfolio' };

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** Read-only sample (ADR 0075): static data, no database access, no analysts, no AI calls. */
export default function DemoPortfolioPage() {
  const rows = DEMO_HOLDINGS.map((h) => {
    const value = h.quantity * (h.ltp ?? h.avgPrice);
    return { ...h, value, pl: value - h.quantity * h.avgPrice };
  });
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className={styles.wrap}>
      <div className={styles.banner} role="note">
        <strong>Sample data, not yours.</strong> These holdings and prices are made up so you can look around. Nothing here is saved.
      </div>

      <section className={styles.card}>
        <p className={styles.eyebrow}>Demo portfolio</p>
        <h1 className={styles.title}>{inr(total)} across {rows.length} holdings</h1>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Stock</th>
              <th scope="col" className={styles.num}>Qty</th>
              <th scope="col" className={styles.num}>Value</th>
              <th scope="col" className={styles.num}>P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol}>
                <th scope="row">
                  {r.symbol}
                  <span className={styles.sub}>{r.name}</span>
                </th>
                <td className={styles.num}>{r.quantity}</td>
                <td className={styles.num}>{inr(r.value)}</td>
                <td className={`${styles.num} ${r.pl >= 0 ? styles.up : styles.down}`}>{r.pl >= 0 ? '+' : '−'}{inr(Math.abs(r.pl))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <RiskCopilotCard holdings={DEMO_HOLDINGS} maxPositionPct={RISK_PROFILES.balanced.maxPositionPct} showChatLink={false} />

      <div className={styles.actions}>
        <Link href="/onboarding" className={styles.primary}>Start with my own holdings</Link>
        <Link href="/dashboard" className={styles.link}>Skip to the dashboard</Link>
      </div>
    </div>
  );
}
