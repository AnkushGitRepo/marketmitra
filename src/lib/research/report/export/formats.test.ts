import { describe, expect, it } from 'vitest';
import type { ResearchBlock } from '../../blocks';
import { pendingChapter, type ReportChapter } from '../chapters';
import { reportMarkdown } from './markdown';
import type { ExportMeta } from './meta';
import { blockText, proseText, reportText, wrap } from './text';

const meta: ExportMeta = { symbol: 'POLICYBZR', name: 'PB Fintech Limited', generatedAt: '2026-11-25T11:30:00Z', model: 'gemini (default)' };
const ready = (id: ReportChapter['id'], over: Partial<ReportChapter> = {}): ReportChapter => ({ ...pendingChapter(id), status: 'ready', prose: `Prose of ${id}.`, ...over });
const kpis: ResearchBlock = { type: 'kpi_grid', items: [{ label: 'Market cap', value: '₹13.19L Cr' }, { label: 'P/E', value: '39.5x', note: 'Peer median 40.2x' }, { label: 'ROCE', value: '17.6%' }, { label: 'FII holding', value: '25.4%' }] };
const chapters = [
  ready('overview', { blocks: [kpis] }),
  ready('financials', { blocks: [{ type: 'data_table', title: 'Cash flow', columns: [{ key: 'y', label: 'Year', format: 'text' }, { key: 'cfo', label: 'CFO', format: 'crore' }], rows: [{ y: 'FY26', cfo: 77556 }] }] }),
  ready('risks', { status: 'failed', prose: null, note: 'quota' }),
];

describe('reportMarkdown', () => {
  const md = reportMarkdown(chapters, meta);
  it('starts with YAML front matter holding the identity and the headline figures', () => {
    const front = md.split('---')[1];
    expect(front).toContain('ticker: "POLICYBZR"');
    expect(front).toContain('date: 2026-11-25');
    expect(front).toContain('market_cap: "₹13.19L Cr"');
    expect(front).toContain('pe: "39.5x"');
    expect(front).toContain('model: "gemini (default)"');
    expect(front).toContain('chapters: 2');
  });
  it('then has the title, the disclaimer, and every chapter with pipe tables', () => {
    expect(md).toContain('# PB Fintech Limited (NSE: POLICYBZR)');
    expect(md).toContain('not investment advice');
    expect(md).toContain('## Business and thesis');
    expect(md).toContain('| Year | CFO |');
    expect(md).toContain('*This chapter could not be written: quota*');
  });
  it('cannot be broken by quotes or line breaks in a company name', () => {
    const front = reportMarkdown(chapters, { ...meta, name: 'A "B"\nC: D' }).split('---')[1];
    expect(front).toContain('company: "A \\"B\\"\\nC: D"');
    expect(front.split('\n').filter((l) => l.startsWith('company:'))).toHaveLength(1);
  });
  it('leaves out a figure that is not in the report rather than writing an empty one', () => {
    expect(reportMarkdown([ready('sector')], meta).split('---')[1]).not.toContain('market_cap');
  });
});

describe('plain text', () => {
  it('wraps words to the width with a hanging indent', () => {
    const lines = wrap('one two three four five six seven eight nine ten', 20, '- ', '  ').split('\n');
    expect(lines.every((l) => l.length <= 20)).toBe(true);
    expect(lines[0].startsWith('- ')).toBe(true);
    expect(lines[1].startsWith('  ')).toBe(true);
  });

  it('writes prose without Markdown marks, with bullets and capitalised headings', () => {
    const out = proseText('## Moat\n\nThe **scale** is *large* and `real`.\n\n- first point\n- second point');
    expect(out).toContain('MOAT');
    expect(out).toContain('The scale is large and real.');
    expect(out).toContain('  - first point');
    expect(out).not.toMatch(/[*`#]/);
  });

  it('aligns a numeric table in columns', () => {
    const out = blockText({ type: 'data_table', title: 'Peers', columns: [{ key: 'n', label: 'Company', format: 'text' }, { key: 'pe', label: 'P/E', format: 'number' }], rows: [{ n: 'Airtel', pe: 39.7 }, { n: 'Jio Platforms', pe: 41.3 }] });
    const lines = out.split('\n');
    const header = lines.find((l) => l.startsWith('Company'))!;
    const row = lines.find((l) => l.startsWith('Jio Platforms'))!;
    expect(header.indexOf('P/E') + 'P/E'.length).toBe(row.indexOf('41.3') + '41.3'.length);
  });

  it('writes a table with long text as short records, not columns that cannot fit', () => {
    const out = blockText({
      type: 'data_table',
      title: 'Risk register',
      columns: [{ key: 'c', label: 'Category', format: 'text' }, { key: 'r', label: 'Risk', format: 'text' }],
      rows: [{ c: 'Financial', r: 'Refinancing of a large bond issue falls due in the next two financial years' }],
    });
    expect(out).toContain('1. Financial');
    expect(out).toContain('Risk: Refinancing');
  });

  it('writes every block type without HTML or Markdown syntax', () => {
    const blocks: ResearchBlock[] = [
      kpis,
      { type: 'donut_chart', title: 'Sectors', slices: [{ label: 'Banks', value: 3 }, { label: 'IT', value: 1 }] },
      { type: 'bar_chart', title: 'P/E', unit: 'x', orientation: 'vertical', categories: ['FY25', 'FY26'], series: [{ name: 'P/E', values: [28.8, null] }] },
      { type: 'financial_chart', title: 'Sales', unit: '₹ Cr', periods: [{ periodEnd: '2026-03-31', label: 'FY26', sales: 1200, operatingProfit: 300, opm: 25, salesGrowth: 20 }] },
      { type: 'thesis_bento', columns: [{ title: 'Catalysts', tone: 'positive', items: ['Tariff hikes'] }] },
    ];
    const out = blocks.map(blockText).join('\n');
    expect(out).toContain('Banks: 75.0%');
    expect(out).toContain('FY26');
    expect(out).toContain('Catalysts');
    expect(out).not.toMatch(/<[a-z]|\*\*|\|---/);
  });

  it('assembles a whole report: banner, contents, numbered chapters, failed chapters, one closing disclaimer', () => {
    const text = reportText(chapters, meta);
    expect(text).toContain('PB Fintech Limited (NSE: POLICYBZR)');
    expect(text).toContain('MM-20261125-POLICYBZR');
    expect(text).toContain('01  Business and thesis');
    expect(text).toContain('01. BUSINESS AND THESIS');
    expect(text).toContain('This chapter could not be written: quota');
    expect(text.trimEnd().split('\n').slice(-3).join(' ')).toContain('synthesis and can contain errors.');
    // Wrapped lines can split the phrase, so count it with whitespace collapsed: once under the contents, once at the very end.
    expect(text.replace(/\s+/g, ' ').match(/not investment advice/g)).toHaveLength(2);
    expect(text.split('\n').filter((l) => l.length > 100)).toEqual([]);
  });
});
