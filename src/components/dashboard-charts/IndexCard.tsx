import Link from 'next/link';
import { buildSparkline } from '@/lib/dashboard/chartMath';
import type { IndexQuoteOut } from '@/lib/dashboard/fundamentalsApi';
import styles from './IndexCard.module.css';

export function IndexCard({ index }: { index: IndexQuoteOut }) {
  const changePct = Number(index.change_pct);
  const change = Number(index.change);
  const value = Number(index.value);
  const up = change >= 0;

  const color = up ? 'var(--app-teal)' : 'var(--app-loss-soft)';
  const chgColor = up ? 'var(--app-gain)' : 'var(--app-loss)';
  const decimals = value >= 1000 ? 2 : 2;

  return (
    <Link href={`/dashboard/index/${encodeURIComponent(index.name)}`} className={styles.card}>
      <p className={styles.name}>{index.name}</p>
      <p className={styles.value}>{value.toLocaleString('en-IN', { maximumFractionDigits: decimals })}</p>
      <div className={styles.footer}>
        <span className={styles.chg} style={{ color: chgColor }}>
          {up ? '+' : ''}
          {change.toFixed(2)} ({up ? '+' : ''}
          {changePct.toFixed(2)}%)
        </span>
        <svg viewBox="0 0 120 34" preserveAspectRatio="none" className={styles.spark} aria-hidden="true">
          <path
            d={buildSparkline(index.spark)}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className={styles.sparkPath}
          />
        </svg>
      </div>
    </Link>
  );
}
