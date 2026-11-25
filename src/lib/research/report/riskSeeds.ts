// Facts that point at risk, computed from stored figures (#360). They go to the model as evidence for the risk register, so
// the register starts from what the numbers show and not from impressions. Each is a plain sentence with its threshold.

import type { AnnouncementOut } from '@/lib/dashboard/fundamentalsApi';
import { formatNumber } from '../formatters';
import { debtToEquity, interestCover, isEmptyYear, netDebt, type YearFigures } from './statements';

const HIGH_DEBT_TO_EQUITY = 1;
const LOW_INTEREST_COVER = 3;
const WEAK_CASH_CONVERSION = 0.8;
const HIGH_NET_DEBT_TO_PROFIT = 3;
const FII_SELLING_POINTS = 1;

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

export interface RiskSeedInput {
  readonly years: readonly YearFigures[];
  /** Promoter pledge as Screener flags it; null when it flags none. */
  readonly pledge: number | null;
  /** Change in foreign institutional holding on the quarter before, in percentage points. */
  readonly fiiChange: number | null;
  readonly announcements: readonly AnnouncementOut[] | null;
}

export function riskSeeds({ years, pledge, fiiChange, announcements }: RiskSeedInput): string[] {
  const live = years.filter((y) => !isEmptyYear(y));
  const latest = live.at(-1);
  const seeds: string[] = [];

  if (latest) {
    const dte = debtToEquity(latest);
    if (dte !== null && dte > HIGH_DEBT_TO_EQUITY) seeds.push(`Debt to equity is ${formatNumber(dte, 2)}x in ${latest.label}, above ${HIGH_DEBT_TO_EQUITY}x.`);
    const cover = interestCover(latest);
    if (cover !== null && cover < LOW_INTEREST_COVER) seeds.push(`Interest cover is ${formatNumber(cover, 1)}x in ${latest.label}, below ${LOW_INTEREST_COVER}x.`);
    const net = netDebt(latest);
    if (net !== null && latest.operatingProfit !== null && latest.operatingProfit > 0 && net / latest.operatingProfit > HIGH_NET_DEBT_TO_PROFIT) {
      seeds.push(`Net debt is ${formatNumber(net / latest.operatingProfit, 1)} times ${latest.label} operating profit, above ${HIGH_NET_DEBT_TO_PROFIT} times.`);
    }
  }

  const both = live.filter((y) => y.cfo !== null && y.netProfit !== null);
  const profit = sum(both.map((y) => y.netProfit as number));
  if (both.length > 0 && profit > 0) {
    const conversion = sum(both.map((y) => y.cfo as number)) / profit;
    if (conversion < WEAK_CASH_CONVERSION) seeds.push(`Operating cash flow was ${formatNumber(conversion * 100, 0)}% of net profit over the ${both.length} years with both figures, below ${WEAK_CASH_CONVERSION * 100}%.`);
  }
  const withFcf = live.filter((y) => y.fcf !== null);
  const negativeFcf = withFcf.filter((y) => (y.fcf as number) < 0);
  if (negativeFcf.length > 0) seeds.push(`Free cash flow was negative in ${negativeFcf.length} of the ${withFcf.length} years on record (${negativeFcf.map((y) => y.label).join(', ')}).`);

  if (pledge !== null) seeds.push(`Promoters have pledged ${formatNumber(pledge, 1)}% of their holding (as flagged by Screener).`);
  if (fiiChange !== null && fiiChange <= -FII_SELLING_POINTS) seeds.push(`Foreign institutional holding fell ${formatNumber(Math.abs(fiiChange), 2)} points in the latest quarter.`);

  const litigation = (announcements ?? []).filter((a) => a.category === 'litigation');
  if (litigation.length > 0) {
    const newest = litigation.find((a) => a.announced_on)?.announced_on;
    seeds.push(`${litigation.length} litigation or penalty notice${litigation.length === 1 ? '' : 's'} in the stored exchange announcements${newest ? ` (latest ${newest})` : ''}.`);
  }
  return seeds;
}
