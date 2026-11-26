import { describe, expect, it } from 'vitest';
import { listNoteSummaries, noteParts, summariseNote, MAX_LIST_LIMIT } from './notesList';

const note = (id: string, over: Partial<Parameters<typeof summariseNote>[0]> = {}) => ({
  id, title: `Note ${id}`, body: `Body of ${id}.`, symbol: null as string | null, tickers: [] as string[], source: 'manual' as const, updatedAt: new Date(`2026-11-${10 + Number(id)}T10:00:00Z`), ...over,
});

describe('listNoteSummaries', () => {
  const notes = [
    note('1', { title: 'Telecom: research brief', source: 'research', tickers: ['JPL', 'IDEA'], body: 'Airtel leads on ARPU.\n\nMore.' }),
    note('2', { title: 'Why I hold TCS', symbol: 'TCS' }),
    note('3', { title: 'Telecom: research brief', source: 'research', tickers: ['BHARTIARTL'] }),
  ];

  it('lists every note, newest first, with the true total', () => {
    const l = listNoteSummaries(notes);
    expect(l.total).toBe(3);
    expect(l.matched).toBe(3);
    expect(l.notes.map((n) => n.id)).toEqual(['3', '2', '1']);
    expect(l.notes[2]).toMatchObject({ kind: 'Saved research', tickers: ['JPL', 'IDEA'], updated: '2026-11-11', preview: 'Airtel leads on ARPU.' });
  });
  it('keeps two notes that have the same title apart', () => {
    expect(listNoteSummaries(notes).notes.filter((n) => n.title === 'Telecom: research brief').map((n) => n.id)).toEqual(['3', '1']);
  });
  it('filters by text and by ticker, and says how many matched out of all', () => {
    expect(listNoteSummaries(notes, { query: 'arpu' }).notes.map((n) => n.id)).toEqual(['1']);
    const t = listNoteSummaries(notes, { symbol: 'tcs' });
    expect(t.notes.map((n) => n.id)).toEqual(['2']);
    expect(t.total).toBe(3);
  });
  it('says when the list was cut by the limit', () => {
    const l = listNoteSummaries(notes, { limit: 2 });
    expect(l.notes).toHaveLength(2);
    expect(l.matched).toBe(3);
    expect(listNoteSummaries(notes, { limit: 10_000 }).notes).toHaveLength(3);
    expect(MAX_LIST_LIMIT).toBe(100);
  });
});

describe('noteParts', () => {
  it('is one part for a short note and several, cut at line breaks, for a long one', () => {
    expect(noteParts('short')).toEqual(['short']);
    const body = Array.from({ length: 40 }, (_, i) => `Line ${i} ${'x'.repeat(40)}`).join('\n');
    const parts = noteParts(body, 500);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts.every((p) => p.length <= 500)).toBe(true);
    expect(parts.join('\n')).toBe(body);
    expect(parts.every((p) => /\d+ x+$/.test(p))).toBe(true); // no line is split
  });
  it('cuts a single long line at the size', () => {
    expect(noteParts('y'.repeat(25), 10).map((p) => p.length)).toEqual([10, 10, 5]);
  });
  it('is one empty part for an empty note', () => {
    expect(noteParts('  ')).toEqual(['']);
  });
});
