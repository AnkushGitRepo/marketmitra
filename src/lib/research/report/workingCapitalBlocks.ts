import type { LineItemOut } from '@/lib/dashboard/fundamentalsApi';
import { type DataTableBlock, type ResearchBlock } from '../blocks';
import { fiscalLabel, missingYearEnds } from '../financialSeries';
import { toNumber } from '../formatters';

const ROWS = [
  ['Debtor Days', 'Debtor days'],
  ['Inventory Days', 'Inventory days'],
  ['Days Payable', 'Payable days'],
  ['Cash Conversion Cycle', 'Cash conversion cycle'],
  ['Working Capital Days', 'Working-capital days'],
] as const;
const YEARS = 6;

/**
 * Working-capital days by year from Screener's Ratios section (the data service's `ratios` statement). A row Screener leaves
 * blank for the company (inventory days for a software firm) is left out; a year missing from the data stays as a gap.
 */
export function workingCapitalBlocks(items: readonly LineItemOut[] | null): ResearchBlock[] {
  const annual = (items ?? []).filter((i) => i.period_type === 'annual');
  const present = ROWS.filter(([label]) => annual.some((i) => i.label === label && toNumber(i.value) !== null));
  if (present.length === 0) return [];
  const ends = [...new Set(annual.map((i) => i.period_end))].sort().slice(-YEARS);
  const periods = ends.flatMap((end, i) => [...(i > 0 ? missingYearEnds(ends[i - 1], end) : []), end]);
  const table: DataTableBlock = {
    type: 'data_table',
    title: 'Working capital, in days',
    note: 'From the Ratios section of the company page. Fewer days tie up less cash.',
    columns: [{ key: 'row', label: '', format: 'text' }, ...periods.map((end) => ({ key: end, label: fiscalLabel(end), format: 'number' as const }))],
    rows: present.map(([label, display]) => ({
      row: display,
      ...Object.fromEntries(periods.map((end) => [end, toNumber(annual.find((i) => i.label === label && i.period_end === end)?.value)])),
    })),
  };
  return [table];
}
