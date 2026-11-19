import styles from './ProChart.module.css';

interface ChartTipProps {
  label: string;
  /** One line on what it does, under the label. */
  hint?: string;
  /** Below the control (top bar) or above it (bottom bar). */
  place?: 'below' | 'above';
  /** Which edge of the control the tip lines up with; `end` for controls near the chart's right edge. */
  align?: 'start' | 'end';
}

/**
 * The name and hint of a toolbar control, in the same style as the tips on the left toolbar (#266). Put it inside the control (its
 * parent): it shows when the parent is hovered or keyboard-focused. The control keeps its own accessible name, so this is decoration.
 */
export function ChartTip({ label, hint, place = 'below', align = 'start' }: ChartTipProps) {
  return (
    <span
      className={`${styles.barTip} ${place === 'above' ? styles.barTipAbove : ''} ${align === 'end' ? styles.barTipEnd : ''}`}
      aria-hidden="true"
    >
      <span className={styles.toolTipLabel}>{label}</span>
      {hint && <span className={styles.toolTipHint}>{hint}</span>}
    </span>
  );
}
