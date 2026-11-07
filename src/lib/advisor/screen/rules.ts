import type { ScreenConfig } from './config';
import type { AnnualYear, GateResult, ScreenData, ScreenResult } from './types';

// The quantitative screen. Pure and deterministic: same ScreenData + config in,
// same result out. Every gate reports what it measured; a gate that cannot be
// evaluated is `unknown` and blocks eligibility — never a silent pass.

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

function monthsBetween(fromIso: string, toIso: string): number {
  const [fy, fm] = fromIso.split('-').map(Number);
  const [ty, tm] = toIso.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** ROCE = EBIT ÷ capital employed, with EBIT = PBT + interest and capital
 * employed = equity + reserves + borrowings. An approximation (the sources give
 * no current-liabilities line), cross-checked against the reported ROCE. */
export function deriveRoce(y: AnnualYear): number | null {
  if (y.profitBeforeTax === null || y.interest === null) return null;
  if (y.equityCapital === null || y.reserves === null || y.borrowings === null) return null;
  const capital = y.equityCapital + y.reserves + y.borrowings;
  if (capital <= 0) return null;
  return ((y.profitBeforeTax + y.interest) / capital) * 100;
}

function gate(
  base: Pick<GateResult, 'id' | 'label' | 'threshold'>,
  status: GateResult['status'],
  actual: string,
  detail: string,
  hard = true,
): GateResult {
  return { ...base, status, actual, detail, hard };
}

const unknown = (base: Pick<GateResult, 'id' | 'label' | 'threshold'>, detail: string) =>
  gate(base, 'unknown', 'n/a', detail);

function lastYears(data: ScreenData, n: number): AnnualYear[] {
  return data.annual.slice(0, n);
}

// ---- data sanity ------------------------------------------------------------

function freshnessGate(data: ScreenData, cfg: ScreenConfig): GateResult {
  const base = { id: 'data_fresh', label: 'Data is recent', threshold: `latest annual ≤ ${cfg.maxDataAgeMonths} months old` };
  const latest = data.annual[0];
  if (!latest) return gate(base, 'fail', 'no annual data', 'No annual financials were returned.');
  const age = monthsBetween(latest.periodEnd, data.asOf);
  return age <= cfg.maxDataAgeMonths
    ? gate(base, 'pass', `${latest.periodEnd} (${age} mo old)`, 'Latest annual results are recent enough.')
    : gate(base, 'fail', `${latest.periodEnd} (${age} mo old)`, 'Financials look stale — do not rely on them.');
}

function completenessGate(data: ScreenData, cfg: ScreenConfig): GateResult {
  const need = Math.max(cfg.roceYears, cfg.fcfWindowYears, cfg.growthWindowYears + 1);
  const base = { id: 'data_complete', label: 'Enough years of history', threshold: `${need} consecutive fiscal years` };
  const years = data.annual.slice(0, need);
  if (years.length < need) {
    return gate(base, 'fail', `${years.length} years`, `Only ${years.length} fiscal years available.`);
  }
  for (let i = 0; i < years.length - 1; i += 1) {
    const gap = monthsBetween(years[i + 1].periodEnd, years[i].periodEnd);
    if (gap < 10 || gap > 14) {
      return gate(base, 'fail', `gap before ${years[i].periodEnd}`, 'Missing or irregular fiscal year in the series.');
    }
  }
  return gate(base, 'pass', `${years.length} years`, 'No missing years in the window.');
}

// ---- quality gates ------------------------------------------------------------

function roceGate(data: ScreenData, cfg: ScreenConfig): GateResult {
  const base = { id: 'roce', label: `${cfg.roceYears}-year average ROCE`, threshold: `≥ ${cfg.minAvgRocePct}%` };
  const years = lastYears(data, cfg.roceYears);
  const values = years.map(deriveRoce);
  if (years.length < cfg.roceYears || values.some((v) => v === null)) {
    return unknown(base, 'ROCE could not be derived for every year in the window.');
  }
  const avg = (values as number[]).reduce((a, b) => a + b, 0) / values.length;
  return gate(
    base,
    avg >= cfg.minAvgRocePct ? 'pass' : 'fail',
    `avg ${f1(avg)}% (${(values as number[]).map(f1).join(', ')})`,
    'Derived from PBT + interest over equity + reserves + borrowings, newest year first.',
  );
}

function debtGate(data: ScreenData, cfg: ScreenConfig): GateResult {
  const sector = data.sector ?? '';
  const limit = cfg.debtToEquityBySector[sector] ?? cfg.maxDebtToEquity;
  const base = { id: 'debt_equity', label: 'Debt / equity', threshold: `≤ ${limit}` };
  if (cfg.debtToEquityExemptSectors.includes(sector)) {
    return gate(base, 'not_applicable', 'n/a', `Debt is the business for ${sector}; judge lenders on separate measures.`);
  }
  const y = data.annual[0];
  if (!y || y.borrowings === null || y.equityCapital === null || y.reserves === null) {
    return unknown(base, 'Borrowings or equity missing for the latest year.');
  }
  const equity = y.equityCapital + y.reserves;
  if (equity <= 0) return gate(base, 'fail', 'negative equity', 'Equity is zero or negative.');
  const de = y.borrowings / equity;
  return gate(base, de <= limit ? 'pass' : 'fail', f2(de), `Latest year (${y.periodEnd}).`);
}

function fcfGate(data: ScreenData, cfg: ScreenConfig): GateResult {
  const base = {
    id: 'fcf',
    label: 'Positive free cash flow',
    threshold: `≥ ${cfg.minPositiveFcfYears} of last ${cfg.fcfWindowYears} years`,
  };
  const years = lastYears(data, cfg.fcfWindowYears);
  if (years.length < cfg.fcfWindowYears || years.some((y) => y.freeCashFlow === null)) {
    return unknown(base, 'Free cash flow missing for some years in the window.');
  }
  const positive = years.filter((y) => (y.freeCashFlow as number) > 0).length;
  return gate(base, positive >= cfg.minPositiveFcfYears ? 'pass' : 'fail', `${positive} of ${years.length} positive`, 'Uses the reported free cash flow line.');
}

function downYears(values: Array<number | null>): number | null {
  if (values.some((v) => v === null)) return null;
  const v = values as number[];
  let down = 0;
  for (let i = 0; i < v.length - 1; i += 1) if (v[i] < v[i + 1]) down += 1; // newest first
  return down;
}

function growthGate(data: ScreenData, cfg: ScreenConfig): GateResult {
  const base = {
    id: 'growth_consistency',
    label: 'Revenue and profit consistency',
    threshold: `≤ ${cfg.maxDownYears} down year(s) in ${cfg.growthWindowYears}, each`,
  };
  const years = lastYears(data, cfg.growthWindowYears + 1);
  if (years.length < cfg.growthWindowYears + 1) return unknown(base, 'Not enough years to compare.');
  const rev = downYears(years.map((y) => y.sales));
  const profit = downYears(years.map((y) => y.netProfit));
  if (rev === null || profit === null) return unknown(base, 'Sales or net profit missing for some years.');
  const ok = rev <= cfg.maxDownYears && profit <= cfg.maxDownYears;
  return gate(base, ok ? 'pass' : 'fail', `revenue down ${rev}, profit down ${profit}`, 'Counts year-on-year declines.');
}

function pledgeGate(data: ScreenData, cfg: ScreenConfig): GateResult {
  const base = { id: 'pledge', label: 'Promoter pledge', threshold: `≤ ${cfg.maxPromoterPledgePct}%` };
  if (data.promoterPledgePct === null) {
    return unknown(base, 'No source currently provides promoter pledge data — check it manually in the shareholding filing.');
  }
  return gate(base, data.promoterPledgePct <= cfg.maxPromoterPledgePct ? 'pass' : 'fail', `${f1(data.promoterPledgePct)}%`, 'Reported pledged share of promoter holding.');
}

function promoterTrendGate(data: ScreenData, cfg: ScreenConfig): GateResult {
  const base = {
    id: 'promoter_trend',
    label: 'No sustained promoter selling',
    threshold: `not down every quarter for ${cfg.promoterDeclineQuarters} quarters by ≥ ${cfg.promoterMinTotalDropPts} pt`,
  };
  const need = cfg.promoterDeclineQuarters + 1;
  const pts = data.promoter.slice(0, need);
  if (pts.length < need) return unknown(base, 'Not enough quarters of shareholding history.');
  let allDown = true;
  for (let i = 0; i < pts.length - 1; i += 1) if (!(pts[i].pct < pts[i + 1].pct)) allDown = false;
  const drop = pts[pts.length - 1].pct - pts[0].pct;
  const sustained = allDown && drop >= cfg.promoterMinTotalDropPts;
  return gate(base, sustained ? 'fail' : 'pass', `${f1(pts[pts.length - 1].pct)}% → ${f1(pts[0].pct)}%`, `Over the last ${cfg.promoterDeclineQuarters} quarters.`);
}

function valuationGate(data: ScreenData, cfg: ScreenConfig): GateResult {
  const base = {
    id: 'valuation',
    label: 'P/E vs own history',
    threshold: `≤ ${cfg.valuationMedianFactor === 1 ? '' : `${cfg.valuationMedianFactor} × `}median of last ${cfg.valuationYears} years`,
  };
  if (data.currentPe === null || data.currentPe <= 0) return unknown(base, 'Current P/E is missing or not meaningful (negative earnings).');
  const historic = lastYears(data, cfg.valuationYears)
    .map((y) => (y.eps !== null && y.eps > 0 && y.priceAtYearEnd !== null ? y.priceAtYearEnd / y.eps : null))
    .filter((v): v is number => v !== null);
  if (historic.length < cfg.minValuationPoints) {
    return unknown(base, `Only ${historic.length} usable year-end P/E points (need ${cfg.minValuationPoints}).`);
  }
  const med = median(historic) as number;
  return gate(
    base,
    data.currentPe <= med * cfg.valuationMedianFactor ? 'pass' : 'fail',
    `now ${f1(data.currentPe)} vs median ${f1(med)} (${historic.length} yrs)`,
    'Historic P/E = year-end price ÷ that year’s EPS.',
  );
}

// ---- entry point --------------------------------------------------------------

export function runScreen(data: ScreenData, cfg: ScreenConfig): ScreenResult {
  const gates: GateResult[] = [
    freshnessGate(data, cfg),
    completenessGate(data, cfg),
    roceGate(data, cfg),
    debtGate(data, cfg),
    fcfGate(data, cfg),
    growthGate(data, cfg),
    pledgeGate(data, cfg),
    promoterTrendGate(data, cfg),
    valuationGate(data, cfg),
  ];

  const flags: string[] = [];
  const derived = data.annual[0] ? deriveRoce(data.annual[0]) : null;
  if (derived !== null && data.reportedRocePct !== null) {
    const gap = Math.abs(derived - data.reportedRocePct);
    if (gap > cfg.roceCrossCheckTolerancePts) {
      flags.push(
        `Derived ROCE (${f1(derived)}%) and the reported ROCE (${f1(data.reportedRocePct)}%) differ by ${f1(gap)} points — the sources may disagree; verify before relying on this.`,
      );
    }
  }
  if (gates.find((g) => g.id === 'debt_equity')?.status === 'not_applicable') {
    flags.push('Debt/equity was skipped for this sector; assess leverage another way.');
  }

  const applicable = gates.filter((g) => g.status !== 'not_applicable');
  const passed = applicable.filter((g) => g.status === 'pass').length;
  const eligible = gates.every((g) => !g.hard || g.status === 'pass' || g.status === 'not_applicable');
  return {
    symbol: data.symbol,
    asOf: data.asOf,
    eligible,
    score: applicable.length === 0 ? 0 : Math.round((passed / applicable.length) * 100),
    gates,
    flags,
  };
}
