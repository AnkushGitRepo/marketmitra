import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import type { ResearchBlock, TableColumn } from './blocks';
import { formatCrore, formatNumber, median } from './formatters';

const CHART_COMPANIES = 6;

const COLUMNS: readonly TableColumn[] = [
  { key: 'name', label: 'Company', format: 'text' },
  { key: 'market_cap', label: 'Market cap', format: 'crore' },
  { key: 'pe', label: 'P/E', format: 'number' },
  { key: 'roce', label: 'ROCE', format: 'percent', best: 'high' },
  { key: 'sales', label: 'Sales growth (3y CAGR)', format: 'percent', best: 'high' },
  { key: 'profit', label: 'Profit growth (3y CAGR)', format: 'percent', best: 'high' },
];

const present = (values: readonly (number | null)[]): number[] => values.filter((v): v is number => v !== null);

/** Summary cards, a leaders table and a growth chart for a theme's largest companies (biggest first). */
export function themeBlocks(sectors: readonly string[], leaders: readonly ScreenerResultRow[], total: number): ResearchBlock[] {
  if (leaders.length === 0) return [];
  const pe = median(present(leaders.map((r) => r.pe).filter((v) => v === null || v > 0)));
  const roce = median(present(leaders.map((r) => r.roce)));
  const top = leaders.slice(0, CHART_COMPANIES);
  return [
    {
      type: 'kpi_grid',
      items: [
        { label: 'Listed companies', value: String(total), note: sectors.join(' / ') },
        { label: `Top ${leaders.length} market cap`, value: formatCrore(present(leaders.map((r) => r.market_cap)).reduce((a, b) => a + b, 0)) },
        { label: 'Median P/E', value: pe === null ? '—' : `${formatNumber(pe)}x`, note: `of the ${leaders.length} largest` },
        { label: 'Median ROCE', value: roce === null ? '—' : `${formatNumber(roce)}%`, note: `of the ${leaders.length} largest` },
      ],
    },
    {
      type: 'data_table',
      title: 'Largest companies',
      columns: COLUMNS,
      rows: leaders.map((r) => ({
        name: `${r.name} (${r.symbol})`,
        market_cap: r.market_cap,
        pe: r.pe,
        roce: r.roce,
        sales: r.sales_growth_3y_cagr,
        profit: r.profit_growth_3y_cagr,
      })),
    },
    {
      type: 'bar_chart',
      title: 'Growth over three years (CAGR)',
      unit: '%',
      orientation: 'vertical',
      categories: top.map((r) => r.symbol),
      series: [
        { name: 'Sales', values: top.map((r) => r.sales_growth_3y_cagr) },
        { name: 'Profit', values: top.map((r) => r.profit_growth_3y_cagr) },
      ],
    },
  ];
}
