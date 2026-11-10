// Numbers for the dashboard hero card. Pure, so the arithmetic (which is easy to get subtly wrong: the "today" percentage
// must be measured against yesterday's value, not today's) is tested.

export interface HeroInput {
  readonly totalValue: number;
  readonly invested: number;
  /** Sum of quantity × today's per-share change across priced holdings. */
  readonly todayChange: number;
}

export interface HeroFigure {
  /** Rupee change (signed). */
  readonly amount: number;
  /** Percentage change, or null when it can't be computed (nothing invested / no previous value). */
  readonly pct: number | null;
  readonly tone: 'gain' | 'loss' | 'flat';
}

export interface HeroMetrics {
  readonly today: HeroFigure;
  readonly total: HeroFigure;
}

const toneOf = (amount: number): HeroFigure['tone'] => (amount > 0 ? 'gain' : amount < 0 ? 'loss' : 'flat');

export function computeHero({ totalValue, invested, todayChange }: HeroInput): HeroMetrics {
  // Today's % is relative to the value at yesterday's close: what you had before today's move.
  const previousValue = totalValue - todayChange;
  const totalReturn = totalValue - invested;
  return {
    today: { amount: todayChange, pct: previousValue > 0 ? (todayChange / previousValue) * 100 : null, tone: toneOf(todayChange) },
    total: { amount: totalReturn, pct: invested > 0 ? (totalReturn / invested) * 100 : null, tone: toneOf(totalReturn) },
  };
}

/** "+1.5%", "-0.8%", "0.0%" — or "—" when there is no percentage. */
export function formatSignedPct(pct: number | null, digits = 1): string {
  if (pct === null || !Number.isFinite(pct)) return '—';
  const fixed = Math.abs(pct).toFixed(digits);
  if (Number(fixed) === 0) return `${(0).toFixed(digits)}%`;
  return `${pct > 0 ? '+' : '-'}${fixed}%`;
}

/** "+₹773", "-₹1,200", "₹0" using the supplied rupee formatter (which handles the hide-values mask). */
export function formatSignedAmount(amount: number, format: (n: number) => string): string {
  if (amount > 0) return `+${format(amount)}`;
  return format(amount); // negatives already carry their own minus; zero has no sign
}
