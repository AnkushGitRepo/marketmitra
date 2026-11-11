import { formatInr } from '@/lib/dashboard/format';
import { rangePosition, type Range52 } from '@/lib/stock/range52';
import styles from './RangeBar.module.css';

interface RangeBarProps {
  readonly price: number | null;
  readonly range: Range52 | null;
}

/** Where today's price sits between the 52-week low and high. Describes, never advises. */
export function RangeBar({ price, range }: RangeBarProps) {
  const pos = rangePosition(price, range);
  if (!range || !pos || price === null) return null;
  const low = formatInr(range.low, 2, false);
  const high = formatInr(range.high, 2, false);
  return (
    <div className={styles.root} role="img" aria-label={`52-week range: low ${low}, high ${high}. ${pos.label}.`}>
      <div className={styles.ends}>
        <span>
          <span className={styles.endLabel}>52W low</span> {low}
        </span>
        <span>
          {high} <span className={styles.endLabel}>52W high</span>
        </span>
      </div>
      <div className={styles.track}>
        <span className={styles.fill} style={{ width: `${pos.pct}%` }} />
        <span className={styles.marker} style={{ left: `${pos.pct}%` }} />
      </div>
      <p className={styles.caption}>{pos.label}</p>
    </div>
  );
}
