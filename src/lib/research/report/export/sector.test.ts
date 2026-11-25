import { describe, expect, it } from 'vitest';
import { pendingChapter, type ReportChapter, type SectorChapterId } from '../chapters';
import { reportDocxBlob } from './docx';
import { reportMarkdown } from './markdown';
import { reportFileBase, type ExportMeta } from './meta';
import { buildReportPrintHtml } from './printDoc';
import { reportText } from './text';

const meta: ExportMeta = { kind: 'sector', symbol: 'Defence & Aerospace', name: 'Defence & Aerospace', generatedAt: '2026-11-25T10:00:00Z', model: 'test-model' };
const chapter = (id: SectorChapterId, prose: string): ReportChapter => ({ ...pendingChapter(id), status: 'ready', prose });
const chapters = [
  { ...chapter('sx_scorecard', 'Scorecard text.'), blocks: [{ type: 'kpi_grid' as const, items: [{ label: 'Listed companies', value: '27' }] }] },
  chapter('sx_overview', 'Overview text.'),
  chapter('sx_checklist', '1. Is the order book funded?'),
];

describe('exporting a sector report', () => {
  it('words the PDF cover for a sector and lists its chapters in reading order', () => {
    const html = buildReportPrintHtml(chapters, meta);
    expect(html).toContain('SECTOR RESEARCH REPORT');
    expect(html).toContain('Independent sector research');
    expect(html).toContain('Sector report');
    expect(html).not.toContain('NSE: Defence');
    expect(html.indexOf('Sector overview, value chain and economics')).toBeLessThan(html.indexOf('Financial scorecard and growth'));
    expect(html).toContain('Listed companies');
  });
  it('has sector front matter, not a ticker, in Markdown', () => {
    const md = reportMarkdown(chapters, meta);
    expect(md).toContain('sector: "Defence & Aerospace"');
    expect(md).not.toContain('ticker:');
    expect(md).toContain('# Defence & Aerospace\n');
    expect(md).toContain('Overview text.');
  });
  it('heads the plain text with the sector name', () => {
    const text = reportText(chapters, meta);
    expect(text).toContain('Defence & Aerospace');
    expect(text).not.toContain('NSE:');
  });
  it('builds a Word file', async () => {
    const blob = await reportDocxBlob(chapters, meta);
    expect(blob.size).toBeGreaterThan(2000);
  });
  it('names the file after the theme', () => {
    expect(reportFileBase(meta)).toBe('MarketMitra-Defence-Aerospace-research-2026-11-25');
  });
});

describe('headline figures are printed once', () => {
  const withGrid = [
    { ...chapter('sx_scorecard', 'Scorecard text.'), blocks: [{ type: 'kpi_grid' as const, items: [{ label: 'Listed companies', value: '27' }] }, { type: 'data_table' as const, title: 'Other table', columns: [{ key: 'a', label: 'A', format: 'text' as const }], rows: [{ a: 'x' }] }] },
  ];
  it('shows the cards on the cover only, not again in the first chapter, and keeps the chapter’s other tables', () => {
    const html = buildReportPrintHtml(withGrid, meta);
    expect(html.match(/Listed companies/g)).toHaveLength(1);
    expect(html).toContain('Other table');
  });
  it('does not drop the cards from the web page’s data or the Markdown', () => {
    expect(reportMarkdown(withGrid, meta)).toContain('Listed companies');
    expect(withGrid[0].blocks).toHaveLength(2);
  });
});

describe('the card grid and the callouts in every format', () => {
  const grid = { type: 'card_grid' as const, title: 'Checklist', columns: 2 as const, numbered: true, cards: [{ heading: 'Is the order book funded?', text: 'Check the sanction letters.' }, { heading: 'How long are receivables?', text: 'Government days.', tag: 'Margin: High' }] };
  const callout = { type: 'thesis_bento' as const, columns: [{ title: 'Policy watch', tone: 'watch' as const, items: ['Satcom rules'] }] };
  const doc = [{ ...chapter('sx_checklist', ''), prose: null, blocks: [grid, callout] }];
  it('prints numbered cards and an amber callout in the PDF', () => {
    const html = buildReportPrintHtml(doc, meta);
    expect(html).toContain('<span class="cn">01</span><b>Is the order book funded?</b>');
    expect(html).toContain('<span class="ct">Margin: High</span>');
    expect(html).toContain('data-tone="watch"');
  });
  it('keeps the numbers in Markdown and text, so the checklist reads as 1, 2', () => {
    const md = reportMarkdown(doc, meta);
    expect(md).toContain('1. **Is the order book funded?** Check the sanction letters.');
    expect(md).toContain('2. **How long are receivables?** (Margin: High) Government days.');
    expect(reportText(doc, meta)).toMatch(/1\. Is the order book funded\?: Check the sanction letters\./);
  });
  it('puts the cards in the Word file', async () => {
    expect((await reportDocxBlob(doc, meta)).size).toBeGreaterThan(2000);
  });
});
