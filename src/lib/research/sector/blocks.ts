// The cards, charts and tables of the sector report (#380), computed from the data service's figures. No model is involved,
// and a number is never worked out beyond a median or a rank of what the data holds.

import type { ResearchBlock, TableColumn } from '../blocks';
import { formatCrore, formatNumber, median } from '../formatters';
import { themeBlocks } from '../themeBlocks';
import type { SectorInputs } from './inputs';
import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';

export const LEADERS_SHOWN = 10;

const present = (values: readonly (number | null)[]): number[] => values.filter((v): v is number => v !== null);
const medianOf = (rows: readonly ScreenerResultRow[], pick: (r: ScreenerResultRow) => number | null): number | null => median(present(rows.map(pick)));
const pct = (v: number | null): string => (v === null ? '—' : `${formatNumber(v)}%`);

/** P/E of a loss-making company is not meaningful, so it is left out of the median. */
const positivePe = (r: ScreenerResultRow): number | null => (r.pe !== null && r.pe > 0 ? r.pe : null);

export function scorecardBlocks(inputs: SectorInputs): ResearchBlock[] {
  const { rows } = inputs;
  if (rows.length === 0) return [];
  const of = `of the ${rows.length} largest`;
  const pe = medianOf(rows, positivePe);
  const chart = themeBlocks(inputs.sectors.length > 0 ? inputs.sectors : inputs.industries, rows, inputs.count).find((b) => b.type === 'bar_chart');
  return [
    {
      type: 'kpi_grid',
      items: [
        { label: 'Listed companies', value: String(inputs.count), note: inputs.label },
        { label: 'Market cap', value: formatCrore(present(rows.map((r) => r.market_cap)).reduce((a, b) => a + b, 0)), note: of },
        { label: 'Median P/E', value: pe === null ? '—' : `${formatNumber(pe)}x`, note: of },
        { label: 'Median ROCE', value: pct(medianOf(rows, (r) => r.roce)), note: of },
        { label: 'Median ROE', value: pct(medianOf(rows, (r) => r.roe)), note: of },
        { label: 'Median sales growth', value: pct(medianOf(rows, (r) => r.sales_growth_3y_cagr)), note: `3y CAGR, ${of}` },
        { label: 'Median profit growth', value: pct(medianOf(rows, (r) => r.profit_growth_3y_cagr)), note: `3y CAGR, ${of}` },
      ],
    },
    ...(chart ? [chart] : []),
  ];
}

const COLUMNS: readonly TableColumn[] = [
  { key: 'name', label: 'Company', format: 'text' },
  { key: 'market_cap', label: 'Market cap', format: 'crore' },
  { key: 'pe', label: 'P/E', format: 'number' },
  { key: 'pb', label: 'P/B', format: 'number' },
  { key: 'roce', label: 'ROCE', format: 'percent', best: 'high' },
  { key: 'roe', label: 'ROE', format: 'percent', best: 'high' },
  { key: 'de', label: 'Debt / equity', format: 'number', best: 'low' },
  { key: 'sales', label: 'Sales 3y CAGR', format: 'percent', best: 'high' },
  { key: 'profit', label: 'Profit 3y CAGR', format: 'percent', best: 'high' },
];

interface Leadership {
  readonly metric: string;
  readonly pick: (r: ScreenerResultRow) => number | null;
  readonly higher: boolean;
  readonly format: (v: number) => string;
  /** Only positive values count (a negative P/E or a zero debt ratio is not a lead). */
  readonly positiveOnly?: boolean;
}

const LEADERSHIP: readonly Leadership[] = [
  { metric: 'Largest by market cap', pick: (r) => r.market_cap, higher: true, format: (v) => formatCrore(v) },
  { metric: 'Highest ROCE', pick: (r) => r.roce, higher: true, format: (v) => `${formatNumber(v)}%` },
  { metric: 'Highest ROE', pick: (r) => r.roe, higher: true, format: (v) => `${formatNumber(v)}%` },
  { metric: 'Fastest sales growth (3y CAGR)', pick: (r) => r.sales_growth_3y_cagr, higher: true, format: (v) => `${formatNumber(v)}%` },
  { metric: 'Fastest profit growth (3y CAGR)', pick: (r) => r.profit_growth_3y_cagr, higher: true, format: (v) => `${formatNumber(v)}%` },
  { metric: 'Lowest debt / equity', pick: (r) => r.debt_to_equity, higher: false, format: (v) => formatNumber(v, 2) },
  { metric: 'Lowest P/E (profitable)', pick: positivePe, higher: false, format: (v) => `${formatNumber(v)}x`, positiveOnly: true },
];

/** Who leads on each measure among the companies fetched; a measure nobody reports is left out. */
export function leadershipRows(rows: readonly ScreenerResultRow[]): { metric: string; company: string; value: string }[] {
  return LEADERSHIP.flatMap((m) => {
    const scored = rows.flatMap((r) => {
      const v = m.pick(r);
      return v === null || (m.positiveOnly && v <= 0) ? [] : [{ r, v }];
    });
    if (scored.length === 0) return [];
    const best = scored.reduce((a, b) => (m.higher ? (b.v > a.v ? b : a) : b.v < a.v ? b : a));
    return [{ metric: m.metric, company: `${best.r.name} (${best.r.symbol})`, value: m.format(best.v) }];
  });
}

export function leadersBlocks(inputs: SectorInputs): ResearchBlock[] {
  const top = inputs.rows.slice(0, LEADERS_SHOWN);
  if (top.length === 0) return [];
  return [
    {
      type: 'data_table',
      title: `Top ${top.length} listed companies by market cap`,
      columns: COLUMNS,
      rows: top.map((r) => ({
        name: `${r.name} (${r.symbol})`,
        market_cap: r.market_cap,
        pe: positivePe(r),
        pb: r.pb,
        roce: r.roce,
        roe: r.roe,
        de: r.debt_to_equity,
        sales: r.sales_growth_3y_cagr,
        profit: r.profit_growth_3y_cagr,
      })),
    },
    {
      type: 'data_table',
      title: 'Who leads on each measure',
      columns: [
        { key: 'metric', label: 'Measure', format: 'text' },
        { key: 'company', label: 'Company', format: 'text' },
        { key: 'value', label: 'Value', format: 'text' },
      ],
      rows: leadershipRows(inputs.rows),
    },
  ];
}
