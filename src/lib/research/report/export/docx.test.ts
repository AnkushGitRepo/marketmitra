import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { ResearchBlock } from '../../blocks';
import { pendingChapter, type ReportChapter } from '../chapters';
import { chartAsTable } from './chartTables';
import { reportDocxBytes } from './docx';
import type { ExportMeta } from './meta';

const meta: ExportMeta = { symbol: 'POLICYBZR', name: 'PB Fintech & "Co" Limited', generatedAt: '2026-11-25T11:30:00Z', model: 'gemini (default)' };
const ready = (id: ReportChapter['id'], over: Partial<ReportChapter> = {}): ReportChapter => ({ ...pendingChapter(id), status: 'ready', prose: `Prose of ${id}.`, ...over });

const blocks: ResearchBlock[] = [
  { type: 'kpi_grid', items: [{ label: 'Market cap', value: '₹13.19L Cr' }, { label: 'P/E', value: '39.5x', note: 'Peer median 40.2x' }] },
  {
    type: 'data_table',
    title: 'Against its peers',
    columns: [{ key: 'n', label: 'Company', format: 'text' }, { key: 'roce', label: 'ROCE', format: 'percent', best: 'high' }],
    rows: [{ n: 'Airtel', roce: 17.6 }, { n: 'Hexacom', roce: 21.4 }],
  },
  { type: 'financial_chart', title: 'Sales and operating profit', unit: '₹ Cr', periods: [{ periodEnd: '2026-03-31', label: 'FY26', sales: 210973, operatingProfit: 116514, opm: 55.2, salesGrowth: 22 }] },
  { type: 'donut_chart', title: 'Sector allocation', slices: [{ label: 'Banks', value: 3 }, { label: 'IT', value: 1 }] },
];

const chapters = [
  ready('overview', { blocks, prose: '## Moat\n\nThe **scale** is *large*.\n\n- first point\n- second point' }),
  ready('risks', { status: 'failed', prose: null, note: 'The provider is overloaded', sources: [{ title: 'sci.gov.in', url: 'https://x.test' }] }),
];

async function parts() {
  const zip = unzipSync(await reportDocxBytes(chapters, meta));
  const text = (name: string) => strFromU8(zip[name]);
  const footerName = Object.keys(zip).find((n) => /word\/footer\d*\.xml$/.test(n)) as string;
  return { names: Object.keys(zip), doc: text('word/document.xml'), styles: text('word/styles.xml'), footer: text(footerName) };
}

describe('reportDocxBytes', () => {
  it('is a real Word file: a zip with the main document, styles and a footer', async () => {
    const { names } = await parts();
    expect(names).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml', 'word/styles.xml']));
    expect(names.some((n) => /word\/footer\d*\.xml$/.test(n))).toBe(true);
  });

  it('uses real Heading 1 and Heading 2 styles so Word’s navigation pane lists the chapters', async () => {
    const { doc, styles } = await parts();
    expect(doc).toMatch(/<w:pStyle w:val="Heading1"\/>/);
    expect(doc).toMatch(/<w:pStyle w:val="Heading2"\/>/);
    expect(styles).toMatch(/w:styleId="Heading1"/);
    expect(doc).toContain('Business and thesis');
    expect(doc).toContain('Risks and watch-items');
  });

  it('writes the figures as tables, with the best cell marked and the chart as a table of its figures', async () => {
    const { doc } = await parts();
    expect(doc).toContain('Against its peers');
    expect(doc).toContain('21.4%');
    expect(doc).toContain('2,10,973');
    expect(doc).toContain('Sector allocation');
    expect(doc).toContain('75.0%');
    expect(doc).toContain('E6F7F1'); // the best-in-column shading
    expect(doc).toContain('<w:tbl>');
  });

  it('writes the prose without Markdown marks, as bold and italic runs and bullets', async () => {
    const { doc } = await parts();
    expect(doc).toContain('first point');
    expect(doc).not.toContain('**');
    expect(doc).toMatch(/<w:b\/>[\s\S]*scale/);
    expect(doc).toMatch(/<w:numPr>/);
  });

  it('puts "Page X of Y" in the footer and says plainly that a chapter failed', async () => {
    const { footer, doc } = await parts();
    expect(footer).toContain('PAGE');
    expect(footer).toContain('NUMPAGES');
    expect(footer).toContain('not investment advice');
    expect(doc).toContain('This chapter could not be written: The provider is overloaded');
    expect(doc).toContain('Sources: sci.gov.in');
  });

  it('escapes a name with quotes and ampersands, and builds with no chapters at all', async () => {
    const { doc } = await parts();
    expect(doc).toContain('PB Fintech &amp; &quot;Co&quot; Limited');
    expect((await reportDocxBytes([], meta)).byteLength).toBeGreaterThan(1000);
  });
});

describe('chartAsTable', () => {
  it('gives the figures behind each chart and nothing for a non-chart', () => {
    expect(chartAsTable(blocks[2])?.rows[0]).toEqual(['FY26', '2,10,973', '1,16,514', '55.2%', '22.0%']);
    expect(chartAsTable(blocks[3])?.rows).toEqual([['Banks', '75.0%'], ['IT', '25.0%']]);
    expect(chartAsTable({ type: 'bar_chart', title: 'P/E', unit: 'x', orientation: 'vertical', categories: ['FY25'], series: [{ name: 'P/E', values: [null] }] })?.rows).toEqual([['FY25', '—']]);
    expect(chartAsTable(blocks[0])).toBeNull();
  });
});
