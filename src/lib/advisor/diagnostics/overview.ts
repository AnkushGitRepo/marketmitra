import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import { listAnalysts } from '@/lib/analysts/store';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import { getPolicy } from '../policy/store';
import { auditPortfolio, type PortfolioAudit } from './audit';
import { reviewDrawdowns, type DrawdownRow } from './drawdown';
import { effectiveRules, type EffectiveRules, type ProfileId } from './profiles';
import { trackerRows, type AnalystView, type TrackerRow } from './tracker';

export interface AdvisorOverview {
  readonly rules: EffectiveRules;
  readonly holdings: readonly HoldingLike[];
  readonly audit: PortfolioAudit;
  readonly drawdowns: readonly DrawdownRow[];
  readonly tracker: readonly TrackerRow[];
}

/** Everything the Advisor page needs, from live holdings and cached quotes. A saved policy is optional. */
export async function loadOverview(userId: string, profile: ProfileId): Promise<AdvisorOverview> {
  const [holdings, policy, analysts] = await Promise.all([
    getEnrichedHoldings(userId),
    getPolicy(userId).catch(() => null),
    listAnalysts(userId).catch(() => []),
  ]);
  const rules = effectiveRules(profile, policy);
  const views: AnalystView[] = analysts.map((a) => ({
    symbol: a.symbol,
    status: a.status,
    hasDossier: a.dossier !== null,
    criteria: a.criteria,
  }));
  const like: HoldingLike[] = holdings.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    quantity: h.quantity,
    avgPrice: h.avgPrice,
    ltp: h.ltp,
    sector: h.sector,
    dayChange: h.dayChange,
  }));
  return {
    rules,
    holdings: like,
    audit: auditPortfolio(like, rules.limits),
    drawdowns: reviewDrawdowns(like),
    tracker: trackerRows(like, views),
  };
}
