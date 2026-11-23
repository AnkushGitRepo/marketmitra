// Totals for the wizard's holdings list header. Pure, so it tests without a DOM.

export interface SummaryRow {
  readonly quantity: number;
  readonly avgPrice: number;
}

export function summarizeHoldings(rows: readonly SummaryRow[]): { readonly count: number; readonly invested: number } {
  return { count: rows.length, invested: rows.reduce((sum, r) => sum + r.quantity * r.avgPrice, 0) };
}

/** "13 holdings · ₹52,469 invested" (Indian digit grouping, whole rupees). */
export function formatSummary(rows: readonly SummaryRow[]): string {
  const { count, invested } = summarizeHoldings(rows);
  const rupees = Math.round(invested).toLocaleString('en-IN');
  return `${count} ${count === 1 ? 'holding' : 'holdings'} · ₹${rupees} invested`;
}
