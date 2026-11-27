// The cash page's headline figures (#422). Pure.

export interface CashSummary {
  readonly equity: number;
  readonly cash: number;
  /** Equity plus cash. */
  readonly total: number;
  readonly equityPct: number;
  readonly cashPct: number;
}

export function cashSummary(equity: number, cash: number): CashSummary {
  const e = Math.max(equity, 0);
  const c = Math.max(cash, 0);
  const total = e + c;
  return { equity: e, cash: c, total, equityPct: total > 0 ? (e / total) * 100 : 0, cashPct: total > 0 ? (c / total) * 100 : 0 };
}
