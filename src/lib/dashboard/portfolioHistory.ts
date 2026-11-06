import { getPrices, type PricePeriod, type PricePointOut } from './fundamentalsApi';
import { slicePricesByPeriod } from './pricePeriods';
import { downsample, formatPriceLabel } from './transforms';
import type { RangeSeries } from './chartMath';

export interface HeldPosition {
  symbol: string;
  quantity: number;
}

/** Approximates historical portfolio value by applying *current* holding
 * quantities to each symbol's real historical closes and summing per day —
 * "what this book would have been worth on each past date, holding what
 * you hold today." This is real historical price data, not fabricated, but
 * it isn't a true transaction-by-transaction history (we don't store buy
 * dates) — captioned as such wherever it's shown. */
export async function getPortfolioValueHistory(
  positions: HeldPosition[],
  period: PricePeriod
): Promise<RangeSeries> {
  if (positions.length === 0) return { v: [], l: [] };

  const priceSets = await Promise.all(positions.map((p) => getPrices(p.symbol, period)));
  return buildSeries(positions, priceSets, period);
}

const ALL_PERIODS: PricePeriod[] = ['1mo', '6mo', '1y', '5y'];

/** Every period's series from a single 5-year fetch per symbol — N price
 * requests instead of 4 × N (see `slicePricesByPeriod`). */
export async function getPortfolioValueHistories(
  positions: HeldPosition[]
): Promise<Record<PricePeriod, RangeSeries>> {
  if (positions.length === 0) {
    const empty = (): RangeSeries => ({ v: [], l: [] });
    return { '1mo': empty(), '6mo': empty(), '1y': empty(), '5y': empty() };
  }
  const fiveYear = await Promise.all(positions.map((p) => getPrices(p.symbol, '5y')));
  return Object.fromEntries(
    ALL_PERIODS.map((period) => [
      period,
      buildSeries(
        positions,
        fiveYear.map((rows) => slicePricesByPeriod(rows, period)),
        period
      ),
    ])
  ) as Record<PricePeriod, RangeSeries>;
}

function buildSeries(
  positions: HeldPosition[],
  priceSets: (PricePointOut[] | null)[],
  period: PricePeriod
): RangeSeries {
  const byDate = new Map<string, number>();
  positions.forEach((position, i) => {
    for (const point of priceSets[i] ?? []) {
      if (point.close === null) continue;
      const contribution = position.quantity * Number(point.close);
      byDate.set(point.trade_date, (byDate.get(point.trade_date) ?? 0) + contribution);
    }
  });

  const dates = downsample([...byDate.keys()].sort());
  return {
    v: dates.map((d) => byDate.get(d)!),
    l: dates.map((d) => formatPriceLabel(d, period)),
  };
}
