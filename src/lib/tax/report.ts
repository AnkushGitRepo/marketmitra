// Builds the tax view of a user's holdings (#414): used by the Portfolio page, GET /api/tax and Mitra.

import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import { listPurchaseDates } from './dates';
import {
  LONG_TERM_MONTHS, LTCG_EXEMPTION, LTCG_RATE, RULES_AS_OF, STCG_RATE,
  financialYear, harvestCandidates, lotTax, summarise,
  type HarvestCandidate, type LotTax, type TaxSummary,
} from './india';

export interface TaxReport {
  /** The day the report is for, YYYY-MM-DD. */
  readonly today: string;
  readonly financialYear: { readonly label: string; readonly end: string; readonly daysLeft: number };
  readonly rules: { readonly asOf: string; readonly stcgRate: number; readonly ltcgRate: number; readonly ltcgExemption: number; readonly longTermMonths: number };
  readonly lots: readonly LotTax[];
  readonly summary: TaxSummary;
  readonly harvest: readonly HarvestCandidate[];
  readonly note: string;
}

export const TAX_NOTE =
  'An estimate to help you plan, not tax advice. It ignores surcharge, cess, brokerage, STT and carried-forward losses, and treats each holding as one lot bought on the date you gave.';

export async function buildTaxReport(userId: string, today: Date, booked: { short: number; long: number } = { short: 0, long: 0 }): Promise<TaxReport> {
  const [holdings, dates] = await Promise.all([getEnrichedHoldings(userId), listPurchaseDates(userId).catch(() => ({}) as Record<string, string>)]);
  const lots = holdings.map((h) => lotTax({ holdingId: h.id, symbol: h.symbol, quantity: h.quantity, avgPrice: h.avgPrice, ltp: h.ltp, purchaseDate: dates[h.id] ?? null }, today));
  const fy = financialYear(today);
  return {
    today: today.toISOString().slice(0, 10),
    financialYear: { label: fy.label, end: fy.end.toISOString().slice(0, 10), daysLeft: fy.daysLeft },
    rules: { asOf: RULES_AS_OF, stcgRate: STCG_RATE, ltcgRate: LTCG_RATE, ltcgExemption: LTCG_EXEMPTION, longTermMonths: LONG_TERM_MONTHS },
    lots,
    summary: summarise(lots, booked.short, booked.long),
    harvest: harvestCandidates(lots, booked.short, booked.long),
    note: TAX_NOTE,
  };
}
