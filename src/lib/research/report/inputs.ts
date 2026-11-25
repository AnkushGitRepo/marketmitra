import type {
  AnnouncementOut,
  CompanyOut,
  InsightOut,
  LineItemOut,
  PeerOut,
  PricePointOut,
  RatioOut,
  ShareholdingOut,
} from '@/lib/dashboard/fundamentalsApi';

/** Everything the data service holds about one company that the report reads. Any part may be missing. */
export interface ReportInputs {
  readonly symbol: string;
  readonly company: CompanyOut;
  readonly ratios: readonly RatioOut[] | null;
  readonly profitAndLoss: readonly LineItemOut[] | null;
  readonly balanceSheet: readonly LineItemOut[] | null;
  readonly cashFlow: readonly LineItemOut[] | null;
  /** Screener's Ratios section: working-capital days. */
  readonly ratiosHistory: readonly LineItemOut[] | null;
  readonly shareholding: readonly ShareholdingOut[] | null;
  readonly peers: readonly PeerOut[] | null;
  readonly prices: readonly PricePointOut[] | null;
  readonly announcements: readonly AnnouncementOut[] | null;
  readonly insights: readonly InsightOut[] | null;
}
