import { toneLabel } from '@/lib/ai/structuredBrief';
import { BRIEF_SPECS } from '@/lib/ai/briefSpecs';
import type { SummaryItem } from '@/lib/funds/compareSummary';
import styles from './CompareSummaryCard.module.css';

const LABELS: Readonly<Record<SummaryItem['key'], string>> = { tradeoff: 'Risk vs return', fit: 'Portfolio fit' };
const SPEC = BRIEF_SPECS.fund;

/** The trade-off, in two points, worked out from the table below. Description only: it never says what to pick. */
export function CompareSummaryCard({ items }: { readonly items: readonly SummaryItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.card} aria-label="Trade-off summary">
      <h2 className={styles.title}>Trade-off summary</h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.key} className={styles.item}>
            <span className={`${styles.pill} ${styles[`pill_${item.tone}`]}`}>
              {LABELS[item.key]}
              <span className={styles.tone}> · {toneLabel(item.tone, SPEC)}</span>
            </span>
            <p className={styles.text}>{item.text}</p>
          </li>
        ))}
      </ul>
      <p className={styles.meta}>Worked out from the table below and your holdings, not by an AI. Description, not investment advice.</p>
    </section>
  );
}
