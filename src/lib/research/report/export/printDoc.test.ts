import { describe, expect, it } from 'vitest';
import type { DataTableBlock } from '../../blocks';
import { pendingChapter, type ReportChapter } from '../chapters';
import { escapeHtml, markdownToHtml } from './html';
import { reportDate, reportDateLong, reportFileBase, reportRef, headlineFigures, type ExportMeta } from './meta';
import { columnWidths } from './printBlocks';
import { buildReportPrintHtml, PRINT_CSS, WATERMARK } from './printDoc';

const meta: ExportMeta = { symbol: 'POLICYBZR', name: 'PB Fintech Limited', generatedAt: '2026-11-25T11:30:00Z', model: 'gemini (default)' };
const ready = (id: ReportChapter['id'], over: Partial<ReportChapter> = {}): ReportChapter => ({ ...pendingChapter(id), status: 'ready', prose: `Prose of ${id}.`, ...over });

describe('meta', () => {
  it('names the file and the reference from the symbol and the Indian date', () => {
    expect(reportFileBase(meta)).toBe('MarketMitra-POLICYBZR-research-2026-11-25');
    expect(reportRef(meta)).toBe('MM-20261125-POLICYBZR');
    expect(reportDateLong(meta.generatedAt)).toBe('25 Nov 2026');
  });
  it('uses the date in India, so a late-evening UTC report is the next day', () => {
    expect(reportDate('2026-11-25T20:00:00Z')).toBe('2026-11-26');
  });
  it('keeps a file name safe whatever the symbol holds', () => {
    expect(reportFileBase({ ...meta, symbol: 'M&M/FIN' })).toBe('MarketMitra-M-M-FIN-research-2026-11-25');
  });
  it('reads the headline cards from the overview chapter', () => {
    const c = ready('overview', { blocks: [{ type: 'kpi_grid', items: [{ label: 'Market cap', value: '₹13.19L Cr' }, { label: 'P/E', value: '39.5x', note: 'Peer median 40.2x' }] }] });
    expect(headlineFigures([c])).toEqual([{ label: 'Market cap', value: '₹13.19L Cr', note: undefined }, { label: 'P/E', value: '39.5x', note: 'Peer median 40.2x' }]);
    expect(headlineFigures([])).toEqual([]);
  });
});

describe('html', () => {
  it('escapes everything it writes', () => {
    expect(escapeHtml(`<script>"a" & 'b'</script>`)).toBe('&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;');
  });
  it('turns the model’s markdown into escaped html and never passes markup through', () => {
    const html = markdownToHtml('## Heading\n\nText with **bold** and <img src=x onerror=alert(1)>.\n\n- one\n- two');
    expect(html).toContain('<h4 class="sub">Heading</h4>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('<li>two</li>');
  });
});

describe('columnWidths', () => {
  const register: DataTableBlock = {
    type: 'data_table',
    title: 'Risk register',
    columns: [
      { key: 'category', label: 'Category', format: 'text' },
      { key: 'risk', label: 'Risk', format: 'text' },
      { key: 'probability', label: 'Probability', format: 'text' },
      { key: 'severity', label: 'Severity', format: 'text' },
      { key: 'rating', label: 'Rating', format: 'text' },
      { key: 'watch', label: 'What to watch', format: 'text' },
    ],
    rows: [{ category: 'Regulatory and legal', risk: 'x'.repeat(220), probability: 'Medium', severity: 'Medium', rating: 'Medium', watch: 'y'.repeat(90) }],
  };
  it('sums to 100 and gives long text the most room', () => {
    const w = columnWidths(register);
    expect(Math.round(w.reduce((a, b) => a + b, 0) * 10) / 10).toBe(100);
    expect(w[1]).toBeGreaterThan(w[2] * 2);
  });
  it('leaves a narrow column wide enough for its header word and its values, so nothing splits mid-word', () => {
    const w = columnWidths(register);
    const A4_CONTENT_MM = 182;
    const mm = (i: number) => (w[i] / 100) * A4_CONTENT_MM;
    // "Probability" in 9px bold needs about 15 mm with cell padding; "Medium" about 11 mm.
    expect(mm(2)).toBeGreaterThanOrEqual(15);
    expect(mm(3)).toBeGreaterThanOrEqual(11);
    expect(mm(4)).toBeGreaterThanOrEqual(11);
  });
  it('fits a six-column numeric table, a single column, and no rows', () => {
    const numeric: DataTableBlock = { type: 'data_table', title: 't', columns: ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ key: k, label: k, format: 'number' as const })), rows: [] };
    expect(columnWidths(numeric).every((n) => n > 10)).toBe(true);
    expect(columnWidths({ ...numeric, columns: [numeric.columns[0]] })).toEqual([100]);
  });
});

describe('buildReportPrintHtml', () => {
  const html = buildReportPrintHtml([ready('overview'), ready('risks', { status: 'failed', prose: null, note: 'The provider is overloaded' }), ready('sector', { sources: [{ title: 'sci.gov.in', url: 'https://x.test' }] })], meta);

  it('is one standalone A4 document with no margin for a browser header or footer to print in', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(PRINT_CSS).toContain('@page { size: A4 portrait; margin: 0; }');
    expect(html).toContain('<title>MarketMitra-POLICYBZR-research-2026-11-25</title>');
  });
  it('has the cover, the contents in reading order, a watermark and a running footer', () => {
    expect(html).toContain('MARKETMITRA RESEARCH');
    expect(html).toContain('PB Fintech Limited');
    expect(html).toContain(WATERMARK);
    expect(html).toContain('Public data synthesis');
    expect(html.indexOf('Business and thesis')).toBeLessThan(html.indexOf('Sector and industry'));
    expect(html.indexOf('Sector and industry')).toBeLessThan(html.indexOf('Risks and watch-items'));
  });
  it('says plainly that a chapter failed, keeps the rest, and lists sources by name', () => {
    expect(html).toContain('This chapter could not be written: The provider is overloaded');
    expect(html).toContain('Sources: sci.gov.in');
    expect(html).toContain('Prose of overview.');
  });
  it('does not carry anything from the web page: no status line, buttons or app styles', () => {
    expect(html).not.toMatch(/Writing…|Chapter \d of \d|<button|<link rel="stylesheet"/);
  });
  it('only breaks inside a table at a row, never inside a whole chapter', () => {
    expect(PRINT_CSS).toMatch(/figure\.tbl tr \{ break-inside: avoid; \}/);
    expect(PRINT_CSS).not.toMatch(/\.chapter\s*\{[^}]*break-inside/);
    expect(PRINT_CSS).toMatch(/\.chapter h2[^}]*break-after: avoid/);
  });
  it('escapes a company name that tries to add markup', () => {
    const evil = buildReportPrintHtml([ready('overview')], { ...meta, name: '<b>X</b>' });
    expect(evil).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(evil).not.toContain('<h1><b>');
  });
  it('prints an empty or pending chapter nowhere, and does not fail with no chapters', () => {
    const none = buildReportPrintHtml([pendingChapter('sector')], meta);
    expect(none).not.toContain('<h2><span>01</span>Sector');
    expect(() => buildReportPrintHtml([], meta)).not.toThrow();
  });
});
