import { describe, expect, it } from 'vitest';
import { blocksToMarkdown } from './blocksMarkdown';

describe('blocksToMarkdown', () => {
  it('renders each block type as markdown a note can keep', () => {
    const md = blocksToMarkdown([
      { type: 'kpi_grid', items: [{ label: 'ROCE', value: '10.3%', note: 'ROE 8.9%' }] },
      {
        type: 'data_table',
        title: 'Peers',
        columns: [
          { key: 'name', label: 'Company', format: 'text' },
          { key: 'pe', label: 'P/E', format: 'number' },
        ],
        rows: [{ name: 'A | B', pe: 12.34 }, { name: 'C', pe: null }],
      },
      {
        type: 'bar_chart',
        title: 'Sales',
        unit: '₹ Cr',
        orientation: 'vertical',
        categories: ['Mar 25'],
        series: [{ name: 'Sales', values: [116547] }, { name: 'Margin', values: [12.5] }],
      },
      {
        type: 'financial_chart',
        title: 'Sales and operating profit',
        unit: '₹ Cr',
        periods: [
          { periodEnd: '2025-03-31', label: 'FY25', sales: 1000, operatingProfit: 200, opm: 20, salesGrowth: null },
          { periodEnd: '2026-03-31', label: 'FY26', sales: 1200, operatingProfit: 300, opm: 25, salesGrowth: 20 },
        ],
      },
      { type: 'donut_chart', title: 'Sectors', slices: [{ label: 'Banks', value: 3 }, { label: 'IT', value: 1 }] },
    ]);
    expect(md).toContain('- **ROCE:** 10.3% (ROE 8.9%)');
    expect(md).toContain('| Company | P/E |');
    expect(md).toContain('| A / B | 12.3 |');
    expect(md).toContain('| C | — |');
    expect(md).toContain('- Banks: 75.0%');
    expect(md).toContain('| FY26 | 1,200 | 300 | 25.0% | 20.0% |');
    expect(md).toContain('| FY25 | 1,000 | 200 | 20.0% | — |');
    expect(md).toContain('| Mar 25 | 1,16,547 | 12.5 |');
  });
});
