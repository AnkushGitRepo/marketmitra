import type {
  AnnouncementOut,
  CompanyOut,
  InsightOut,
  LineItemOut,
  PeerOut,
  PricePointOut,
  RatioOut,
  ShareholdingOut,
  StatementType,
} from '@/lib/dashboard/fundamentalsApi';
import type { ReportInputs } from './inputs';

/** The data-service reads the report needs. Each may return null (the service is down or has nothing). */
export interface ReportGetters {
  readonly getCompany: (symbol: string) => Promise<CompanyOut | null>;
  readonly getRatios: (symbol: string) => Promise<RatioOut[] | null>;
  readonly getFinancials: (symbol: string, statement: StatementType) => Promise<LineItemOut[] | null>;
  readonly getShareholding: (symbol: string) => Promise<ShareholdingOut[] | null>;
  readonly getPeers: (symbol: string) => Promise<PeerOut[] | null>;
  readonly getPrices: (symbol: string, period: '5y') => Promise<PricePointOut[] | null>;
  readonly getAnnouncements: (symbol: string) => Promise<AnnouncementOut[] | null>;
  readonly getInsights: (symbol: string) => Promise<InsightOut[] | null>;
}

/** A read that failed with an exception counts as "nothing", like one that returned null: a missing part must never stop a report. */
const orNull = async <T>(read: Promise<T | null>): Promise<T | null> => {
  try {
    return await read;
  } catch {
    return null;
  }
};

/** Everything the report reads about one company, in parallel; null when the company itself is unknown. */
export async function gatherReportInputs(symbol: string, g: ReportGetters): Promise<ReportInputs | null> {
  const company = await orNull(g.getCompany(symbol));
  if (!company) return null;
  const [ratios, profitAndLoss, balanceSheet, cashFlow, ratiosHistory, shareholding, peers, prices, announcements, insights] = await Promise.all([
    orNull(g.getRatios(symbol)),
    orNull(g.getFinancials(symbol, 'profit_and_loss')),
    orNull(g.getFinancials(symbol, 'balance_sheet')),
    orNull(g.getFinancials(symbol, 'cash_flow')),
    orNull(g.getFinancials(symbol, 'ratios')),
    orNull(g.getShareholding(symbol)),
    orNull(g.getPeers(symbol)),
    orNull(g.getPrices(symbol, '5y')),
    orNull(g.getAnnouncements(symbol)),
    orNull(g.getInsights(symbol)),
  ]);
  return { symbol, company, ratios, profitAndLoss, balanceSheet, cashFlow, ratiosHistory, shareholding, peers, prices, announcements, insights };
}
