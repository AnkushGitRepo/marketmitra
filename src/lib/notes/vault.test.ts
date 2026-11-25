import { describe, expect, it } from 'vitest';
import { askMitraHref, filterCounts, filterNotes, noteCategory, notePreview, noteTickers, timeAgo, type VaultNote } from './vault';

const note = (over: Partial<VaultNote>): VaultNote => ({
  id: '1',
  title: 'Why I hold TCS',
  body: 'Steady cash flows.',
  symbol: null,
  tickers: [],
  source: 'manual',
  updatedAt: new Date('2026-11-25'),
  ...over,
});

describe('noteCategory', () => {
  it('puts saved research first, then splits own notes by symbol', () => {
    expect(noteCategory(note({ source: 'research', symbol: 'TCS' }))).toBe('research');
    expect(noteCategory(note({ symbol: 'TCS' }))).toBe('stock');
    expect(noteCategory(note({}))).toBe('general');
  });
});

describe('noteTickers', () => {
  it('lists the symbol first and drops repeats', () => {
    expect(noteTickers({ symbol: 'IDEA', tickers: ['JPL', 'IDEA'] })).toEqual(['IDEA', 'JPL']);
    expect(noteTickers({ symbol: null, tickers: [] })).toEqual([]);
  });
});

describe('filterNotes', () => {
  const notes = [
    note({ id: 'a', title: 'Telecom deep dive', body: 'ARPU and 5G capex', source: 'research', tickers: ['BHARTIARTL'] }),
    note({ id: 'b', title: 'Why I hold LAURUSLABS', symbol: 'LAURUSLABS', body: 'CDMO margins' }),
    note({ id: 'c', title: 'Rate cycle', body: 'Watching the repo rate' }),
  ];
  it('filters by group', () => {
    expect(filterNotes(notes, 'research', '').map((n) => n.id)).toEqual(['a']);
    expect(filterNotes(notes, 'stock', '').map((n) => n.id)).toEqual(['b']);
    expect(filterNotes(notes, 'all', '')).toHaveLength(3);
  });
  it('searches title, body and tickers, ignoring case', () => {
    expect(filterNotes(notes, 'all', 'arpu').map((n) => n.id)).toEqual(['a']);
    expect(filterNotes(notes, 'all', 'bhartiartl').map((n) => n.id)).toEqual(['a']);
    expect(filterNotes(notes, 'all', ' repo ').map((n) => n.id)).toEqual(['c']);
  });
  it('combines a group and a search', () => {
    expect(filterNotes(notes, 'stock', 'arpu')).toEqual([]);
  });
  it('counts each group', () => {
    expect(filterCounts(notes)).toEqual({ all: 3, research: 1, stock: 1, general: 1 });
  });
});

describe('notePreview', () => {
  it('prefers the first line of prose over headings and tables', () => {
    expect(notePreview('## What it is\n\nA **telecom** operator.')).toBe('A telecom operator.');
    expect(notePreview('| A | B |\n| --- | --- |\n- Real text')).toBe('Real text');
    expect(notePreview('> quoted line')).toBe('quoted line');
  });
  it('falls back to a heading, cuts long text, and handles empty', () => {
    expect(notePreview('## Only a heading')).toBe('Only a heading');
    expect(notePreview('x'.repeat(300))).toHaveLength(110);
    expect(notePreview('')).toBe('');
  });
});

describe('askMitraHref', () => {
  it('opens Mitra with the note title in the question', () => {
    const href = askMitraHref('Why I hold "TCS"');
    expect(href.startsWith('/mitra?q=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('Why I hold "TCS"');
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-11-25T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it('counts minutes, hours and days', () => {
    expect(timeAgo(ago(20_000), now)).toBe('just now');
    expect(timeAgo(ago(60_000), now)).toBe('1 min ago');
    expect(timeAgo(ago(2 * 60_000), now)).toBe('2 mins ago');
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe('3 hours ago');
    expect(timeAgo(ago(3 * 86_400_000), now)).toBe('3 days ago');
  });
  it('shows a date from a week on, and accepts an ISO string', () => {
    expect(timeAgo(ago(8 * 86_400_000), now)).toBe('17 Nov 2026');
    expect(timeAgo('2026-11-25T11:59:00Z', now)).toBe('1 min ago');
  });
});
