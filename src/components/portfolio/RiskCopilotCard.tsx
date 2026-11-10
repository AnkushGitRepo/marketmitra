import Link from 'next/link';
import { buildRiskCards, type HoldingLike, type RiskSeverity } from '@/lib/portfolio/portfolioMetrics';
import styles from './RiskCopilotCard.module.css';

const ICON: Record<string, string> = { concentration: '⚠️', sector: '⚖️', drivers: '🚀' };
const SEVERITY_LABEL: Record<RiskSeverity, string> = { high: 'High', medium: 'Moderate', low: 'Low', info: 'Insight' };
const SEVERITY_CLASS: Record<RiskSeverity, string> = {
  high: styles.high,
  medium: styles.medium,
  low: styles.low,
  info: styles.info,
};

/** Mitra's read on the portfolio as three scannable cards. Computed from the numbers, so it needs no AI key. */
export function RiskCopilotCard({ holdings }: { readonly holdings: readonly HoldingLike[] }) {
  const cards = buildRiskCards(holdings);

  return (
    <section className={styles.card} aria-label="Mitra risk copilot">
      <div className={styles.head}>
        <h2 className={styles.title}>Mitra risk copilot</h2>
        <span className={styles.badge}>Mitra</span>
      </div>
      {cards.length === 0 ? (
        <p className={styles.empty}>Risk notes appear once live prices load.</p>
      ) : (
        <ul className={styles.list}>
          {cards.map((c) => (
            <li key={c.id} className={`${styles.item} ${SEVERITY_CLASS[c.severity]}`}>
              <span className={styles.icon} aria-hidden="true">
                {ICON[c.id]}
              </span>
              <div>
                <p className={styles.itemTitle}>
                  {c.title} <span className={styles.level}>{SEVERITY_LABEL[c.severity]}</span>
                </p>
                <p className={styles.text}>{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.disclaimer}>A summary of your own numbers, not investment advice.</p>
      <Link href="/mitra" className={styles.cta}>
        Chat with Mitra about this portfolio →
      </Link>
    </section>
  );
}
