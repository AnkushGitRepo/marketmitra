import { compactBlocks, type BarChartBlock, type DataTableBlock, type KpiGridBlock, type KpiItem, type ResearchBlock } from '../blocks';
import { formatNumber } from '../formatters';
import { ownMedianPe, peAtYearEnds, scenariosFromHistory, type PeAtYearEnd, type ScenarioSet } from './valuation';
import type { YearFigures } from './statements';
import type { PricePointOut } from '@/lib/dashboard/fundamentalsApi';

export interface ValuationInput {
  readonly years: readonly YearFigures[];
  readonly prices: readonly PricePointOut[] | null;
  /** Current ratios by name (Stock P/E, Current Price, Book Value). */
  readonly ratios: Readonly<Record<string, number | null>>;
  /** Median P/E of the listed peers, when there are enough of them. */
  readonly peerMedianPe: number | null;
}

const x = (v: number): string => `${formatNumber(v, 1)}x`;
const signedPercent = (v: number): string => `${v >= 0 ? '+' : '−'}${formatNumber(Math.abs(v), 0)}%`;

function kpis(current: number | null, own: ReturnType<typeof ownMedianPe>, peer: number | null, pb: number | null): KpiGridBlock | null {
  const premium = current !== null && own !== null ? (current / own.value - 1) * 100 : null;
  const items: (KpiItem | null)[] = [
    current === null ? null : { label: 'P/E now', value: x(current) },
    own === null ? null : { label: 'Own median P/E', value: x(own.value), note: `At ${own.years} fiscal year ends` },
    premium === null ? null : { label: 'Against its own median', value: signedPercent(premium), note: premium >= 0 ? 'Premium' : 'Discount' },
    peer === null ? null : { label: 'Peer median P/E', value: x(peer) },
    pb === null ? null : { label: 'Price to book', value: x(pb) },
  ];
  const shown = items.filter((i): i is KpiItem => i !== null);
  return shown.length === 0 ? null : { type: 'kpi_grid', items: shown };
}

function peChart(history: readonly PeAtYearEnd[], current: number | null): BarChartBlock | null {
  if (!history.some((h) => h.pe !== null)) return null;
  return {
    type: 'bar_chart',
    title: 'P/E at each fiscal year end',
    unit: 'x',
    orientation: 'vertical',
    categories: [...history.map((h) => h.label), ...(current === null ? [] : ['Now'])],
    series: [{ name: 'P/E', values: [...history.map((h) => h.pe), ...(current === null ? [] : [current])] }],
  };
}

function scenarioTable(set: ScenarioSet | null): DataTableBlock | null {
  if (!set) return null;
  return {
    type: 'data_table',
    title: `What its own history implies for the year after ${set.from}`,
    note: 'Bear, base and bull are the lower quartile, median and upper quartile of the sales growth and operating margin of the years on record, applied to the latest year. A range drawn from the past: not a forecast, a target or a recommendation.',
    columns: [
      { key: 'scenario', label: 'Scenario', format: 'text' },
      { key: 'growth', label: 'Sales growth', format: 'percent' },
      { key: 'margin', label: 'Operating margin', format: 'percent' },
      { key: 'sales', label: 'Sales', format: 'crore' },
      { key: 'profit', label: 'Operating profit', format: 'crore' },
    ],
    rows: set.scenarios.map((s) => ({ scenario: s.name, growth: s.salesGrowth, margin: s.margin, sales: s.sales, profit: s.operatingProfit })),
  };
}

/** Valuation cards, the P/E history and the history-based scenarios. A part with no data behind it is left out. */
export function valuationBlocks(input: ValuationInput): ResearchBlock[] {
  const history = peAtYearEnds(input.years, input.prices);
  const current = input.ratios['Stock P/E'] ?? null;
  const price = input.ratios['Current Price'] ?? null;
  const book = input.ratios['Book Value'] ?? null;
  const pb = price !== null && book !== null && book > 0 ? price / book : null;
  return compactBlocks([
    kpis(current, ownMedianPe(history), input.peerMedianPe, pb),
    peChart(history, current),
    scenarioTable(scenariosFromHistory(input.years)),
  ]);
}
