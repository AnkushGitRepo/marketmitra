import { describe, expect, it } from 'vitest';
import { CHAPTERS, chapterMeta, chaptersToMarkdown, pendingChapter, type ReportChapter } from './chapters';

const ready = (id: ReportChapter['id'], over: Partial<ReportChapter> = {}): ReportChapter => ({ ...pendingChapter(id), status: 'ready', prose: `Prose of ${id}.`, ...over });

describe('CHAPTERS', () => {
  it('has the nine chapters in reading order, with regulatory and legal sharing a jump label', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(['overview', 'financials', 'peers', 'sector', 'regulatory', 'legal', 'management', 'valuation', 'risks']);
    expect(chapterMeta('regulatory').nav).toBe(chapterMeta('legal').nav);
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(9);
  });
});

describe('chaptersToMarkdown', () => {
  it('writes each chapter under its title, in order, whatever order they finished in', () => {
    const md = chaptersToMarkdown([ready('risks'), ready('overview')]);
    expect(md.indexOf('## Business and thesis')).toBeLessThan(md.indexOf('## Risks and watch-items'));
    expect(md).toContain('Prose of overview.');
  });

  it('puts a chapter\'s tables before its text and lists its sources', () => {
    const md = chaptersToMarkdown([
      ready('financials', {
        blocks: [{ type: 'kpi_grid', items: [{ label: 'Cash conversion', value: '240%' }] }],
        sources: [{ title: 'Economic Times', url: 'https://et.test/a' }],
      }),
    ]);
    expect(md.indexOf('Cash conversion')).toBeLessThan(md.indexOf('Prose of financials.'));
    expect(md).toContain('- Economic Times (https://et.test/a)');
  });

  it('says plainly that a failed chapter could not be written, and keeps its figures', () => {
    const md = chaptersToMarkdown([
      ready('legal', { status: 'failed', prose: null, note: 'The provider is overloaded', blocks: [{ type: 'kpi_grid', items: [{ label: 'Events', value: '3' }] }] }),
    ]);
    expect(md).toContain('*This chapter could not be written: The provider is overloaded*');
    expect(md).toContain('**Events:** 3');
  });

  it('leaves out a chapter that has nothing at all, and a missing one', () => {
    expect(chaptersToMarkdown([pendingChapter('sector')])).toBe('');
    expect(chaptersToMarkdown([])).toBe('');
  });
});
