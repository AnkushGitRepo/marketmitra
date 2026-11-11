import type { Milestone } from '@/lib/dashboard/ipoView';
import styles from './IpoTimeline.module.css';

/** Bidding, allotment and listing as ordered milestones; finished ones are ticked, the next one is emphasised. */
export function IpoTimeline({ milestones }: { readonly milestones: readonly Milestone[] }) {
  return (
    <ol className={styles.line} aria-label="IPO timeline">
      {milestones.map((m) => (
        <li key={m.id} className={`${styles.step} ${styles[m.state]}`}>
          <span className={styles.dot} aria-hidden="true">
            {m.state === 'done' ? '✓' : ''}
          </span>
          <span className={styles.text}>
            <span className={styles.label}>{m.label}</span>
            <span className={styles.date}>{m.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
