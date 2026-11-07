// Normalised inputs and outputs of the quality screen. The rules operate only
// on these shapes, so they are pure and testable without any network.

export interface AnnualYear {
  /** Fiscal year end, ISO date. */
  periodEnd: string;
  sales: number | null;
  netProfit: number | null;
  profitBeforeTax: number | null;
  interest: number | null;
  eps: number | null;
  borrowings: number | null;
  equityCapital: number | null;
  reserves: number | null;
  freeCashFlow: number | null;
  /** Share price on/just before periodEnd (for historical P/E). */
  priceAtYearEnd: number | null;
}

export interface PromoterPoint {
  quarterEnd: string;
  pct: number;
}

export interface ScreenData {
  symbol: string;
  sector: string | null;
  /** ISO date the screen is evaluated for. */
  asOf: string;
  /** Newest first. */
  annual: AnnualYear[];
  /** Newest first. */
  promoter: PromoterPoint[];
  reportedRocePct: number | null;
  currentPe: number | null;
  /** Promoter pledge, % — not provided by any current source, so normally null. */
  promoterPledgePct: number | null;
}

export type GateStatus = 'pass' | 'fail' | 'unknown' | 'not_applicable';

export interface GateResult {
  id: string;
  label: string;
  status: GateStatus;
  /** The measured value(s), human-readable, e.g. "avg 21.4% (5y)". */
  actual: string;
  /** The rule being tested, e.g. "≥ 15%". */
  threshold: string;
  /** Why — especially for unknown / not_applicable. */
  detail: string;
  /** A hard gate must pass for eligibility; sanity gates are hard too. */
  hard: boolean;
}

export interface ScreenResult {
  symbol: string;
  asOf: string;
  eligible: boolean;
  /** % of applicable gates passed (0–100); informational, never a substitute for the gates. */
  score: number;
  gates: GateResult[];
  /** Non-blocking warnings (e.g. sources disagree). */
  flags: string[];
}
