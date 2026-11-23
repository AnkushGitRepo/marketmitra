// The three risk profiles offered at first run (ADR 0075). Only numbers that are actually enforced appear here:
// the alert guardrails created for each new holding, and the concentration threshold the portfolio page warns at.

export const RISK_PROFILE_IDS = ['conservative', 'balanced', 'aggressive'] as const;
export type RiskProfileId = (typeof RISK_PROFILE_IDS)[number];

export const DEFAULT_RISK_PROFILE: RiskProfileId = 'balanced';

export interface RiskProfile {
  readonly id: RiskProfileId;
  readonly label: string;
  readonly summary: string;
  /** Trailing-stop distance for a new holding's default alert. */
  readonly trailPct: number;
  /** Drop over the drawdown window that triggers the default drawdown alert. */
  readonly drawdownPct: number;
  /** One stock above this share of the portfolio is flagged as concentrated. */
  readonly maxPositionPct: number;
}

export const RISK_PROFILES: Readonly<Record<RiskProfileId, RiskProfile>> = {
  conservative: { id: 'conservative', label: 'Conservative', summary: 'Tighter alerts, smaller single-stock weights.', trailPct: 8, drawdownPct: 15, maxPositionPct: 10 },
  balanced: { id: 'balanced', label: 'Balanced growth', summary: 'A middle path between protection and upside.', trailPct: 10, drawdownPct: 20, maxPositionPct: 15 },
  aggressive: { id: 'aggressive', label: 'Aggressive', summary: 'Wider alerts and room for larger positions.', trailPct: 15, drawdownPct: 30, maxPositionPct: 20 },
};

export interface GuardrailDefaults {
  readonly trailPct: number;
  readonly drawdownPct: number;
}

export function guardrailDefaultsFor(id: RiskProfileId): GuardrailDefaults {
  const { trailPct, drawdownPct } = RISK_PROFILES[id];
  return { trailPct, drawdownPct };
}
