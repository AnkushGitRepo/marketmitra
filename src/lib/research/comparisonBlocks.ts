import { compactBlocks, type BarChartBlock, type DataTableBlock, type ResearchBlock, type TableColumn } from './blocks';
import { latestSalesGrowth, type CompanyData } from './companyData';

const COLUMNS: readonly TableColumn[] = [
  { key: 'name', label: 'Company', format: 'text' },
  { key: 'market_cap', label: 'Market cap', format: 'crore' },
  { key: 'pe', label: 'P/E', format: 'number' },
  { key: 'roce', label: 'ROCE', format: 'percent', best: 'high' },
  { key: 'roe', label: 'ROE', format: 'percent', best: 'high' },
  { key: 'div_yield', label: 'Dividend yield', format: 'percent', best: 'high' },
  { key: 'sales_growth', label: 'Sales growth (latest year)', format: 'percent', best: 'high' },
];

const bars = (title: string, unit: string, companies: readonly CompanyData[], pick: (c: CompanyData) => number | null): BarChartBlock | null => {
  const values = companies.map(pick);
  if (values.every((v) => v === null)) return null;
  return {
    type: 'bar_chart',
    title,
    unit,
    orientation: 'horizontal',
    categories: companies.map((c) => c.symbol),
    series: [{ name: title, values }],
  };
};

/** The side-by-side table (best value per column highlighted) and one bar chart per headline metric. */
export function comparisonBlocks(companies: readonly CompanyData[]): ResearchBlock[] {
  if (companies.length < 2) return [];
  const table: DataTableBlock = {
    type: 'data_table',
    title: 'Side by side',
    columns: COLUMNS,
    rows: companies.map((c) => ({
      name: `${c.name} (${c.symbol})`,
      market_cap: c.ratios['Market Cap'] ?? null,
      pe: c.ratios['Stock P/E'] ?? null,
      roce: c.ratios['ROCE'] ?? null,
      roe: c.ratios['ROE'] ?? null,
      div_yield: c.ratios['Dividend Yield'] ?? null,
      sales_growth: latestSalesGrowth(c),
    })),
  };
  return compactBlocks([
    table,
    bars('ROCE', '%', companies, (c) => c.ratios['ROCE'] ?? null),
    bars('P/E', 'x', companies, (c) => c.ratios['Stock P/E'] ?? null),
    bars('Sales growth, latest year', '%', companies, latestSalesGrowth),
  ]);
}
