import { describe, expect, it } from 'vitest';
import { pendingChapter, type ReportChapter, type ReportEvent } from './chapters';
import { EMPTY_REPORT, parseNdjson, reduceReport, reportProgress } from './stream';

const start: ReportEvent = { type: 'start', symbol: 'ACME', name: 'Acme Ltd', chapters: [{ id: 'overview', title: 'Business and thesis' }, { id: 'financials', title: 'Financials and cash flow' }, { id: 'risks', title: 'Risks' }] };
const chapter = (id: ReportChapter['id'], over: Partial<ReportChapter> = {}): ReportEvent => ({ type: 'chapter', chapter: { ...pendingChapter(id), ...over } });
const fold = (events: ReportEvent[]) => events.reduce(reduceReport, EMPTY_REPORT);

describe('reduceReport', () => {
  it('learns the company and the chapter order from start', () => {
    const s = fold([start]);
    expect(s).toMatchObject({ symbol: 'ACME', name: 'Acme Ltd', order: ['overview', 'financials', 'risks'] });
  });

  it('replaces a chapter when it arrives again with its text', () => {
    const s = fold([start, chapter('overview'), chapter('overview', { status: 'ready', prose: 'Written.' })]);
    expect(s.chapters.overview).toMatchObject({ status: 'ready', prose: 'Written.' });
  });

  it('keeps chapters that arrive out of order', () => {
    const s = fold([start, chapter('risks', { status: 'ready' }), chapter('overview')]);
    expect(Object.keys(s.chapters).sort()).toEqual(['overview', 'risks']);
  });

  it('records done and error, and a new start clears an old report', () => {
    const done: ReportEvent = { type: 'done', model: 'gemini', generatedAt: '2026-11-25T10:00:00Z', content: '## x', note: { title: 't', symbol: 'ACME', tickers: ['ACME'] } };
    expect(fold([start, done]).done).toEqual(done);
    expect(fold([start, { type: 'error', message: 'Key rejected' }]).error).toBe('Key rejected');
    expect(fold([start, chapter('overview'), start]).chapters).toEqual({});
  });

  it('ignores a chapter or an event it does not know, and does not change the state it was given', () => {
    const before = fold([start]);
    const frozen = JSON.stringify(before);
    reduceReport(before, chapter('overview'));
    expect(JSON.stringify(before)).toBe(frozen);
    expect(reduceReport(before, { type: 'chapter', chapter: { ...pendingChapter('overview'), id: 'weather' as never } })).toBe(before);
    expect(reduceReport(before, { type: 'mystery' } as never)).toBe(before);
  });
});

describe('reportProgress', () => {
  it('counts finished chapters (written or failed), not pending ones', () => {
    const s = fold([start, chapter('overview', { status: 'ready' }), chapter('financials'), chapter('risks', { status: 'failed' })]);
    expect(reportProgress(s)).toEqual({ finished: 2, total: 3 });
    expect(reportProgress(EMPTY_REPORT)).toEqual({ finished: 0, total: 0 });
  });
});

describe('parseNdjson', () => {
  const line = (e: ReportEvent) => `${JSON.stringify(e)}\n`;

  it('reads whole lines and keeps an unfinished one for the next chunk', () => {
    const a = parseNdjson('', `${line(start)}{"type":"chap`);
    expect(a.events).toHaveLength(1);
    expect(a.rest).toBe('{"type":"chap');
    const b = parseNdjson(a.rest, `ter","chapter":${JSON.stringify(pendingChapter('overview'))}}\n`);
    expect(b.events.map((e) => e.type)).toEqual(['chapter']);
    expect(b.rest).toBe('');
  });

  it('copes with a chunk that cuts a line anywhere, including inside multi-byte text', () => {
    const payload = line(chapter('overview', { prose: 'Airtel ₹1.47L Cr — sales' }) as ReportEvent);
    for (let cut = 1; cut < payload.length; cut += 7) {
      const first = parseNdjson('', payload.slice(0, cut));
      const second = parseNdjson(first.rest, payload.slice(cut));
      expect([...first.events, ...second.events]).toHaveLength(1);
    }
  });

  it('drops a broken line and lines without a type, and keeps reading', () => {
    const out = parseNdjson('', `not json\n{"no":"type"}\n\n${line(start)}`);
    expect(out.events.map((e) => e.type)).toEqual(['start']);
  });
});
