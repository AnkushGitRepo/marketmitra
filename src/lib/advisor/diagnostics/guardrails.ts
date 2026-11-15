import type { PortfolioAudit } from './audit';
import type { DrawdownRow } from './drawdown';
import type { StressResult } from './stress';

export type PillStatus = 'ok' | 'watch' | 'over';

export interface GuardrailPill {
  readonly id: 'stock' | 'sector' | 'concentration' | 'drawdown' | 'stress';
  readonly label: string;
  readonly status: PillStatus;
}

export interface GuardrailSummary {
  readonly pills: readonly GuardrailPill[];
  readonly healthy: number;
  readonly total: number;
}

/** Top three holdings above this share of the portfolio count as concentrated. */
export const CONCENTRATION_LIMIT_PCT = 50;
/** The market fall the page's headline stress check uses. */
export const HEADLINE_STRESS_FALL_PCT = 15;

export interface GuardrailInput {
  readonly audit: PortfolioAudit;
  readonly drawdowns: readonly DrawdownRow[];
  /** The headline market-fall scenario against the user's drawdown tolerance. */
  readonly stress: StressResult;
}

/** Five at-a-glance checks, each a traffic light. Healthy means `ok`. */
export function guardrailSummary({ audit, drawdowns, stress }: GuardrailInput): GuardrailSummary {
  const anyOver = (rows: PortfolioAudit['stocks']) => rows.some((r) => r.status === 'over');
  const pills: GuardrailPill[] = [
    { id: 'stock', label: 'Single-stock limit', status: anyOver(audit.stocks) ? 'over' : 'ok' },
    { id: 'sector', label: 'Sector limit', status: anyOver(audit.sectors) ? 'over' : 'ok' },
    { id: 'concentration', label: 'Top-3 concentration', status: audit.top3Pct > CONCENTRATION_LIMIT_PCT ? 'over' : 'ok' },
    { id: 'drawdown', label: 'Deep drawdowns', status: drawdowns.length > 0 ? 'watch' : 'ok' },
    { id: 'stress', label: 'Stress tolerance', status: stress.withinTolerance ? 'ok' : 'over' },
  ];
  return { pills, healthy: pills.filter((p) => p.status === 'ok').length, total: pills.length };
}
