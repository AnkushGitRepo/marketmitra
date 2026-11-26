// The cards, charts and tables of the head-to-head report (#394), computed from the data service's figures. No model is involved
// and nothing is estimated beyond the labelled projection.

import type { ResearchBlock, TableCell } from '../blocks';
import { formatCrore, formatMultiple, formatNumber, formatPercent } from '../formatters';
import { categoryWinners, negativeNetWorth, trajectory, valuationVsGrowth, type CompareCompany } from './analysis';

const DASH = '—';
const num = (v: number | null): string => (v === null ? DASH : formatNumber(v, 2));

/** Chapter 1: who leads on each measure, as four cards. */
export function verdictBlocks(companies: readonly CompareCompany[]): ResearchBlock[] {
  if (companies.length < 2) return [];
  const sunk = negativeNetWorth(companies).map((c) => c.symbol);
  return [
    {
      type: 'kpi_grid',
      items: categoryWinners(companies).map((w) => ({
        label: w.category,
        value: w.symbol ?? DASH,
        note: w.category === 'Balance-sheet safety' && sunk.length > 0 ? `${w.detail}. Negative net worth: ${sunk.join(', ')}` : w.detail,
        tone: w.symbol ? ('positive' as const) : ('neutral' as const),
      })),
    },
  ];
}

export const PROJECTION_NOTE =
  'Years marked E are a projection, not an analyst forecast: each company’s own sales or profit growth over the years shown, carried forward and fading by a fifth each year (capped at +30% and −15%). A company whose history is too short or loss-making is not projected.';

/** Chapter 2: every company on one chart, switchable between revenue, operating profit and growth from a common base of 100. */
export function trajectoryBlocks(companies: readonly CompareCompany[]): ResearchBlock[] {
  const t = trajectory(companies);
  if (!t) return [];
  return [
    {
      type: 'trajectory_chart',
      title: 'Where each company has been and where its own trend leads',
      note: PROJECTION_NOTE,
      labels: t.labels,
      projectedFrom: t.projectedFrom,
      views: [
        { key: 'sales', label: 'Revenue', unit: '₹ crore', series: t.series.sales },
        { key: 'operatingProfit', label: 'Operating profit', unit: '₹ crore', series: t.series.operatingProfit },
        { key: 'indexed', label: 'Growth, base 100', unit: t.indexBase ? `${t.indexBase} = 100` : 'each company’s first year = 100', series: t.series.indexed },
      ],
    },
  ];
}

interface MatrixRow {
  readonly label: string;
  readonly pick: (c: CompareCompany) => number | null;
  readonly show: (v: number | null) => string;
  /** Which end is better; omitted for a figure with no better end (market cap is size, not quality). */
  readonly best?: 'high' | 'low';
}

const ROWS: readonly MatrixRow[] = [
  { label: 'Market cap', pick: (c) => c.marketCap, show: formatCrore },
  { label: 'P/E', pick: (c) => (c.pe !== null && c.pe > 0 ? c.pe : null), show: (v) => (v === null ? 'n/m' : formatMultiple(v)) },
  { label: 'P/B', pick: (c) => c.pb, show: (v) => (v === null ? DASH : formatMultiple(v)) },
  { label: 'ROCE', pick: (c) => c.roce, show: (v) => formatPercent(v), best: 'high' },
  { label: 'ROE', pick: (c) => c.roe, show: (v) => formatPercent(v), best: 'high' },
  { label: 'Debt / equity', pick: (c) => c.debtToEquity, show: num, best: 'low' },
  { label: 'Dividend yield', pick: (c) => c.dividendYield, show: (v) => formatPercent(v), best: 'high' },
  { label: 'Sales growth, 3y CAGR', pick: (c) => c.salesCagr3y, show: (v) => formatPercent(v), best: 'high' },
  { label: 'Profit growth, 3y CAGR', pick: (c) => c.profitCagr3y, show: (v) => formatPercent(v), best: 'high' },
];

/** The index of the best value, or none when fewer than two companies have one. A negative debt ratio (negative net worth) never wins "low". */
function bestIndex(values: readonly (number | null)[], dir: 'high' | 'low', skipNegative: boolean): number | null {
  const ok = values.flatMap((v, i) => (v === null || (skipNegative && v < 0) ? [] : [{ v, i }]));
  if (ok.length < 2) return null;
  return ok.reduce((a, b) => ((dir === 'high' ? b.v > a.v : b.v < a.v) ? b : a)).i;
}

/** Chapter 3: one column per company and one row per measure, the best figure of each row marked. */
export function matrixBlocks(companies: readonly CompareCompany[]): ResearchBlock[] {
  if (companies.length < 2) return [];
  const rows: Record<string, TableCell>[] = [];
  const highlights: { row: number; column: string }[] = [];
  ROWS.forEach((r, ri) => {
    const values = companies.map(r.pick);
    rows.push({ measure: r.label, ...Object.fromEntries(companies.map((c, i) => [c.symbol, r.show(values[i])])) });
    const win = r.best ? bestIndex(values, r.best, r.label === 'Debt / equity') : null;
    if (win !== null) highlights.push({ row: ri, column: companies[win].symbol });
  });
  return [
    {
      type: 'data_table',
      title: 'Head to head',
      note: 'The best figure in each row is marked. Market cap, P/E and P/B are not ranked (a lower multiple is not better in itself; see the valuation chapter); "n/m" means no positive earnings.',
      columns: [{ key: 'measure', label: 'Measure', format: 'text' }, ...companies.map((c) => ({ key: c.symbol, label: c.symbol, format: 'text' as const }))],
      rows,
      highlights,
    },
  ];
}

/** Chapter 6: whether a higher multiple comes with higher returns and growth. */
export function valuationBlocks(companies: readonly CompareCompany[]): ResearchBlock[] {
  if (companies.length < 2) return [];
  const rows = valuationVsGrowth(companies);
  const pes = rows.map((r) => r.pe);
  return [
    ...(pes.every((p) => p === null)
      ? []
      : [{ type: 'bar_chart' as const, title: 'P/E', unit: 'x', orientation: 'horizontal' as const, categories: companies.map((c) => c.symbol), series: [{ name: 'P/E', values: pes.map((p) => (p !== null && p > 0 ? Math.round(p * 10) / 10 : null)) }] }]),
    {
      type: 'data_table',
      title: 'Is the multiple earned?',
      note: 'P/E per point of profit growth is P/E divided by the three-year profit growth in percent; it is shown only when both are positive. A lower number means less is being paid for each point of growth.',
      columns: [
        { key: 'symbol', label: 'Company', format: 'text' },
        { key: 'pe', label: 'P/E', format: 'multiple' },
        { key: 'roce', label: 'ROCE', format: 'percent', best: 'high' },
        { key: 'growth', label: 'Profit growth 3y', format: 'percent', best: 'high' },
        { key: 'ratio', label: 'P/E per point of growth', format: 'number', best: 'low' },
      ],
      rows: rows.map((r, i) => ({ symbol: r.symbol, pe: r.pe !== null && r.pe > 0 ? r.pe : null, roce: r.roce, growth: companies[i].profitCagr3y, ratio: r.peToGrowth === null ? null : Math.round(r.peToGrowth * 100) / 100 })),
    },
  ];
}
