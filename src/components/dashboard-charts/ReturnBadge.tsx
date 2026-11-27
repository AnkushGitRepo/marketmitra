import { formatSignedAmount, formatSignedPct, type HeroFigure } from '@/lib/dashboard/heroMetrics';
import { compactInr } from '@/lib/dashboard/chartGeometry';
import { formatInr } from '@/lib/dashboard/format';
import styles from './ReturnBadge.module.css';

interface ReturnBadgeProps {
  readonly label: string;
  /** A shorter label shown on a phone, where two badges have to share a row. */
  readonly shortLabel?: string;
  readonly figure: HeroFigure;
  readonly masked: boolean;
  /** Adds a pulsing dot for figures that update with live prices. */
  readonly live?: boolean;
}

const TONE_CLASS = { gain: styles.gain, loss: styles.loss, flat: styles.flat } as const;
const ARROW = { gain: '▲', loss: '▼', flat: '' } as const;

/** "Label ▲ +₹773 (+1.5%)" pill. The arrow and sign carry the meaning as well as the colour. */
export function ReturnBadge({ label, shortLabel, figure, masked, live = false }: ReturnBadgeProps) {
  const amount = formatSignedAmount(figure.amount, (n) => formatInr(n, 0, masked));
  // On a very narrow screen two badges have to share a row, so the amount shortens (+₹13.8k); masked amounts stay masked.
  const shortAmount = formatSignedAmount(figure.amount, (n) => (masked ? formatInr(n, 0, true) : compactInr(n)));
  return (
    <span className={`${styles.badge} ${TONE_CLASS[figure.tone]}`}>
      {live && <span className={styles.liveDot} aria-hidden="true" />}
      {shortLabel ? (
        <span className={styles.label}>
          <span className={styles.labelLong}>{label}</span>
          <span className={styles.labelShort}>{shortLabel}</span>
        </span>
      ) : (
        <span className={styles.label}>{label}</span>
      )}
      {ARROW[figure.tone] && <span aria-hidden="true">{ARROW[figure.tone]}</span>}
      <span>
        <span className={styles.amountLong}>{amount}</span>
        <span className={styles.amountShort}>{shortAmount}</span> ({formatSignedPct(figure.pct)})
      </span>
    </span>
  );
}
