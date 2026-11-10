import { formatSignedAmount, formatSignedPct, type HeroFigure } from '@/lib/dashboard/heroMetrics';
import { formatInr } from '@/lib/dashboard/format';
import styles from './ReturnBadge.module.css';

interface ReturnBadgeProps {
  readonly label: string;
  readonly figure: HeroFigure;
  readonly masked: boolean;
  /** Adds a pulsing dot for figures that update with live prices. */
  readonly live?: boolean;
}

const TONE_CLASS = { gain: styles.gain, loss: styles.loss, flat: styles.flat } as const;
const ARROW = { gain: '▲', loss: '▼', flat: '' } as const;

/** "Label ▲ +₹773 (+1.5%)" pill. The arrow and sign carry the meaning as well as the colour. */
export function ReturnBadge({ label, figure, masked, live = false }: ReturnBadgeProps) {
  const amount = formatSignedAmount(figure.amount, (n) => formatInr(n, 0, masked));
  return (
    <span className={`${styles.badge} ${TONE_CLASS[figure.tone]}`}>
      {live && <span className={styles.liveDot} aria-hidden="true" />}
      <span className={styles.label}>{label}</span>
      {ARROW[figure.tone] && <span aria-hidden="true">{ARROW[figure.tone]}</span>}
      <span>
        {amount} ({formatSignedPct(figure.pct)})
      </span>
    </span>
  );
}
