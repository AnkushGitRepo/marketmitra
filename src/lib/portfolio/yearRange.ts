export interface YearRange {
  /** Where the price sits between the 52-week low (0) and high (1), clamped to that span. */
  readonly position: number;
  readonly badge: 'near-high' | 'near-low' | null;
}

/** Within this share of the 52-week span from either end counts as "near" it. */
export const NEAR_EDGE = 0.05;

/** Position of the price inside its 52-week range, or null when the range or the price is missing or degenerate. */
export function yearRange(ltp: number | null, low: number | null, high: number | null): YearRange | null {
  if (ltp === null || low === null || high === null) return null;
  if (!Number.isFinite(ltp) || !Number.isFinite(low) || !Number.isFinite(high) || high <= low) return null;
  const position = Math.min(1, Math.max(0, (ltp - low) / (high - low)));
  const badge = position >= 1 - NEAR_EDGE ? 'near-high' : position <= NEAR_EDGE ? 'near-low' : null;
  return { position, badge };
}

export const BADGE_LABEL: Record<NonNullable<YearRange['badge']>, string> = {
  'near-high': 'Near 52W high',
  'near-low': 'Near 52W low',
};
