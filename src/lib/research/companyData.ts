import type { LineItemOut, RatioOut, ShareholdingOut } from '@/lib/dashboard/fundamentalsApi';
import { toNumber } from './formatters';

export interface AnnualFigures {
  readonly periodEnd: string;
  readonly sales: number | null;
  readonly operatingProfit: number | null;
}

export interface CompanyData {
  readonly symbol: string;
  readonly name: string;
  /** Ratio name → number (market cap in ₹ crore); a figure that is missing or not a number is null. */
  readonly ratios: Readonly<Record<string, number | null>>;
  /** Up to five annual periods, oldest first. */
  readonly annual: readonly AnnualFigures[];
  /** Foreign institutional holding in the latest quarter and the change from the one before, in percentage points. */
  readonly fii: { readonly latest: number | null; readonly change: number | null };
}

const ANNUAL_PERIODS = 5;
const FII_CATEGORY = /^fii|foreign/i;

function annualSeries(pl: readonly LineItemOut[] | null): AnnualFigures[] {
  const byLabel = (label: string) =>
    new Map((pl ?? []).filter((i) => i.label === label && i.period_type === 'annual').map((i) => [i.period_end, toNumber(i.value)]));
  const sales = byLabel('Sales');
  const operating = byLabel('Operating Profit');
  return [...new Set([...sales.keys(), ...operating.keys()])]
    .sort()
    .slice(-ANNUAL_PERIODS)
    .map((periodEnd) => ({
      periodEnd,
      sales: sales.get(periodEnd) ?? null,
      operatingProfit: operating.get(periodEnd) ?? null,
    }));
}

function fiiHolding(rows: readonly ShareholdingOut[] | null): CompanyData['fii'] {
  const fii = (rows ?? [])
    .filter((r) => FII_CATEGORY.test(r.category))
    .sort((a, b) => b.quarter_end.localeCompare(a.quarter_end));
  const latest = toNumber(fii[0]?.percentage);
  const prior = toNumber(fii[1]?.percentage);
  return { latest, change: latest !== null && prior !== null ? latest - prior : null };
}

export function buildCompanyData(input: {
  symbol: string;
  name: string;
  ratios: readonly RatioOut[] | null;
  profitAndLoss: readonly LineItemOut[] | null;
  shareholding: readonly ShareholdingOut[] | null;
}): CompanyData {
  return {
    symbol: input.symbol,
    name: input.name,
    ratios: Object.fromEntries((input.ratios ?? []).map((r) => [r.name, toNumber(r.value)])),
    annual: annualSeries(input.profitAndLoss),
    fii: fiiHolding(input.shareholding),
  };
}

/** Year-on-year sales growth in the latest annual period, as a percentage. */
export function latestSalesGrowth(data: CompanyData): number | null {
  const [prior, latest] = data.annual.slice(-2);
  if (!prior || !latest || prior.sales === null || latest.sales === null || prior.sales === 0) return null;
  return ((latest.sales - prior.sales) / Math.abs(prior.sales)) * 100;
}
