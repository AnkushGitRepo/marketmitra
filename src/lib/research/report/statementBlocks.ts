import { compactBlocks, type BarChartBlock, type DataTableBlock, type KpiGridBlock, type KpiItem, type ResearchBlock } from '../blocks';
import { formatCrore, formatNumber, formatPercent } from '../formatters';
import { debtToEquity, interestCover, isEmptyYear, type YearFigures } from './statements';

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

function kpis(years: readonly YearFigures[]): KpiGridBlock | null {
  const live = years.filter((y) => !isEmptyYear(y));
  const latest = live.at(-1);
  if (!latest) return null;
  const both = live.filter((y) => y.cfo !== null && y.netProfit !== null);
  const profit = sum(both.map((y) => y.netProfit as number));
  const withFcf = live.filter((y) => y.fcf !== null);
  const dte = debtToEquity(latest);
  const cover = interestCover(latest);

  const items: (KpiItem | null)[] = [
    both.length > 0 && profit > 0
      ? {
          label: 'Cash conversion',
          value: formatPercent((sum(both.map((y) => y.cfo as number)) / profit) * 100, 0),
          note: `Operating cash flow over net profit, ${both.length} years`,
        }
      : null,
    withFcf.length > 0
      ? { label: 'Free cash flow', value: formatCrore(sum(withFcf.map((y) => y.fcf as number))), note: `Added up over ${withFcf.length} years` }
      : null,
    latest.borrowings !== null
      ? { label: `Borrowings, ${latest.label}`, value: formatCrore(latest.borrowings), note: dte === null ? undefined : `Debt to equity ${formatNumber(dte, 2)}x` }
      : null,
    cover !== null ? { label: `Interest cover, ${latest.label}`, value: `${formatNumber(cover, 1)}x`, note: 'Operating profit over interest' } : null,
  ];
  const shown = items.filter((i): i is KpiItem => i !== null);
  return shown.length === 0 ? null : { type: 'kpi_grid', items: shown };
}

function profitVsCash(years: readonly YearFigures[]): BarChartBlock | null {
  if (!years.some((y) => y.cfo !== null || y.fcf !== null)) return null;
  return {
    type: 'bar_chart',
    title: 'Profit against cash flow',
    unit: '₹ Cr',
    orientation: 'vertical',
    categories: years.map((y) => y.label),
    series: [
      { name: 'Net profit', values: years.map((y) => y.netProfit) },
      { name: 'Operating cash flow', values: years.map((y) => y.cfo) },
      { name: 'Free cash flow', values: years.map((y) => y.fcf) },
    ],
  };
}

function leverageTable(years: readonly YearFigures[]): DataTableBlock | null {
  if (years.every(isEmptyYear)) return null;
  return {
    type: 'data_table',
    title: 'Cash flow and leverage by year',
    note: 'From the stored annual statements. A year with dashes is not in the source data.',
    columns: [
      { key: 'period', label: 'Year', format: 'text' },
      { key: 'netProfit', label: 'Net profit', format: 'crore' },
      { key: 'cfo', label: 'Operating cash flow', format: 'crore' },
      { key: 'fcf', label: 'Free cash flow', format: 'crore' },
      { key: 'cfoToEbitda', label: 'CFO / EBITDA', format: 'percent' },
      { key: 'borrowings', label: 'Borrowings', format: 'crore' },
      { key: 'dte', label: 'Debt / equity', format: 'multiple' },
      { key: 'cover', label: 'Interest cover', format: 'multiple' },
    ],
    rows: years.map((y) => ({
      period: y.label,
      netProfit: y.netProfit,
      cfo: y.cfo,
      fcf: y.fcf,
      cfoToEbitda: y.cfoToEbitda,
      borrowings: y.borrowings,
      dte: debtToEquity(y),
      cover: interestCover(y),
    })),
  };
}

/** Cash-flow quality and leverage: summary cards, a profit-against-cash chart and a year-by-year table. */
export function statementBlocks(years: readonly YearFigures[]): ResearchBlock[] {
  return compactBlocks([kpis(years), profitVsCash(years), leverageTable(years)]);
}

