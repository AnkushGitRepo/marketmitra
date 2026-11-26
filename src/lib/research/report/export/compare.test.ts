import { describe, expect, it } from 'vitest';
import type { ResearchBlock } from '../../blocks';
import { matrixBlocks, trajectoryBlocks } from '../../compare/blocks';
import { trio } from '../../compare/fixtures';
import { pendingChapter, type ReportChapter } from '../chapters';
import { chartAsTable } from './chartTables';
import { reportMarkdown } from './markdown';
import type { ExportMeta } from './meta';
import { blockHtml } from './printBlocks';
import { buildReportPrintHtml } from './printDoc';
import { blockText, reportText } from './text';

const meta: ExportMeta = { kind: 'compare', symbol: 'JPL vs BHARTIARTL vs IDEA', name: 'JPL vs BHARTIARTL vs IDEA', generatedAt: '2026-11-26T10:00:00Z', model: 'test-model' };
const chart = trajectoryBlocks(trio())[0];
const matrix = matrixBlocks(trio())[0];
const chapters: ReportChapter[] = [
  { ...pendingChapter('cmp_trajectory', [chart]), status: 'ready', prose: 'Trajectory text.' },
  { ...pendingChapter('cmp_matrix', [matrix]), status: 'ready', prose: 'Matrix text.' },
];

describe('trajectory chart in every export', () => {
  it('is a table of figures for Word and text, with the projected years marked E', () => {
    const t = chartAsTable(chart as ResearchBlock)!;
    expect(t.headers.slice(-3)).toEqual(['FY27E', 'FY28E', 'FY29E']);
    expect(t.rows.some((r) => r[0].startsWith('Revenue (₹ crore): JPL'))).toBe(true);
    expect(blockText(chart)).toContain('Operating profit');
  });
  it('is drawn in the PDF with the actuals solid, the projection dashed and a forecast divider', () => {
    const html = blockHtml(chart);
    expect(html).toContain('stroke-dasharray="6 5"');
    expect(html).toContain('Forecast →');
    expect(html.match(/<svg/g)).toHaveLength(3); // one per metric
    expect(html).toContain('not an analyst forecast');
  });
});

describe('matrix highlights', () => {
  it('mark the best cell of a row in the PDF', () => {
    expect(blockHtml(matrix)).toContain('data-best="true"');
  });
});

describe('a comparison report', () => {
  it('words the cover for a head-to-head and prints the figures in each format', () => {
    const html = buildReportPrintHtml(chapters, meta);
    expect(html).toContain('HEAD-TO-HEAD COMPARISON');
    expect(html).toContain('Head-to-head comparison');
    expect(html).not.toContain('NSE: JPL vs');
    expect(reportMarkdown(chapters, meta)).toContain('comparison: "JPL vs BHARTIARTL vs IDEA"');
    expect(reportMarkdown(chapters, meta)).not.toContain('ticker:');
    expect(reportText(chapters, meta)).toContain('JPL vs BHARTIARTL vs IDEA');
    expect(reportText(chapters, meta)).not.toContain('(NSE:');
  });
});
