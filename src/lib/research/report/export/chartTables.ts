// A chart as the table of figures behind it, for the formats that cannot draw one (Word, text). Pure.

import type { ResearchBlock } from '../../blocks';
import { formatNumber, formatPercent } from '../../formatters';

export interface PlainTable {
  readonly title: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** Columns from this index on are numbers (right-aligned). */
  readonly numericFrom: number;
}

const dash = '—';
const whole = (v: number | null): string => (v === null ? dash : formatNumber(v, Number.isInteger(v) ? 0 : 1));

/** The figures behind a chart block, or null for a block that is not a chart. */
export function chartAsTable(block: ResearchBlock): PlainTable | null {
  switch (block.type) {
    case 'financial_chart':
      return {
        title: `${block.title} (${block.unit})`,
        headers: ['Year', 'Sales', 'Operating profit', 'OPM %', 'Sales growth'],
        rows: block.periods.map((p) => [p.label, formatNumber(p.sales, 0), formatNumber(p.operatingProfit, 0), formatPercent(p.opm), formatPercent(p.salesGrowth)]),
        numericFrom: 1,
      };
    case 'bar_chart':
      return {
        title: `${block.title} (${block.unit})`,
        headers: ['', ...block.series.map((s) => s.name)],
        rows: block.categories.map((cat, i) => [cat, ...block.series.map((s) => whole(s.values[i] ?? null))]),
        numericFrom: 1,
      };
    case 'donut_chart': {
      const total = block.slices.reduce((a, s) => a + s.value, 0);
      return { title: block.title, headers: ['', 'Share'], rows: block.slices.map((s) => [s.label, formatPercent(total === 0 ? 0 : (s.value / total) * 100)]), numericFrom: 1 };
    }
    default:
      return null;
  }
}
