// Every threshold of the quality screen lives here — change a number, change
// the screen. Nothing else in the codebase hard-codes a gate value.
export interface ScreenConfig {
  /** Gate 1: average of the last `roceYears` derived ROCE values, in %. */
  minAvgRocePct: number;
  roceYears: number;
  /** Gate 2: borrowings ÷ (equity capital + reserves). */
  maxDebtToEquity: number;
  /** Per-sector override of maxDebtToEquity (sector names as the API returns them). */
  debtToEquityBySector: Record<string, number>;
  /** Sectors where D/E is not meaningful (lenders); the gate is skipped, and flagged. */
  debtToEquityExemptSectors: string[];
  /** Gate 3: years of positive free cash flow needed out of `fcfWindowYears`. */
  minPositiveFcfYears: number;
  fcfWindowYears: number;
  /** Gate 4: tolerated down years (revenue; profit) in the last `growthWindowYears` changes. */
  maxDownYears: number;
  growthWindowYears: number;
  /** Gate 5: promoter pledge ceiling, % of promoter holding. */
  maxPromoterPledgePct: number;
  /** Gate 6: fail if promoter holding fell in each of the last N quarters and by at least minTotalDropPts. */
  promoterDeclineQuarters: number;
  promoterMinTotalDropPts: number;
  /** Gate 7: current P/E must be ≤ median historical P/E × this factor (1 = at or below the median). */
  valuationMedianFactor: number;
  valuationYears: number;
  minValuationPoints: number;
  /** Data sanity. */
  maxDataAgeMonths: number;
  /** Derived vs reported ROCE disagreement (percentage points) that raises a warning flag. */
  roceCrossCheckTolerancePts: number;
}

export const DEFAULT_SCREEN_CONFIG: ScreenConfig = {
  minAvgRocePct: 15,
  roceYears: 5,
  maxDebtToEquity: 0.5,
  debtToEquityBySector: {},
  debtToEquityExemptSectors: ['Financial Services'],
  minPositiveFcfYears: 4,
  fcfWindowYears: 5,
  maxDownYears: 1,
  growthWindowYears: 5,
  maxPromoterPledgePct: 5,
  promoterDeclineQuarters: 4,
  promoterMinTotalDropPts: 1,
  valuationMedianFactor: 1,
  valuationYears: 5,
  minValuationPoints: 3,
  maxDataAgeMonths: 15,
  roceCrossCheckTolerancePts: 8,
};
