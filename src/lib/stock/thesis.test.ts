import { describe, expect, it } from 'vitest';
import type { JournalSnapshot } from '@/lib/tradeJournal/types';
import { entrySnapshot, findThesisNote, pnlPct, thesisTitle } from './thesis';

const note = (id: string, title: string, symbol: string | null, updatedAt: string) => ({ id, title, body: 'b', symbol, updatedAt });
const snap = (id: string, event: JournalSnapshot['event'], at: string): JournalSnapshot => ({
  id, symbol: 'TCS', event, at, before: null, after: null, marketPrice: null, pe: null, roce: null, thesis: null, reason: null, guardrails: [], postMortem: null,
});

describe('findThesisNote', () => {
  it('finds the note by its title and symbol, ignoring case', () => {
    const notes = [note('1', 'Thesis: tcs', 'tcs', '2026-01-01'), note('2', 'Thesis: INFY', 'INFY', '2026-01-02'), note('3', 'Random', 'TCS', '2026-01-03')];
    expect(findThesisNote(notes, 'TCS')?.id).toBe('1');
  });
  it('takes the newest when there are several, without reordering the input', () => {
    const notes = [note('a', thesisTitle('TCS'), 'TCS', '2026-01-01'), note('b', thesisTitle('TCS'), 'TCS', '2026-05-01')];
    const ids = notes.map((n) => n.id);
    expect(findThesisNote(notes, 'TCS')?.id).toBe('b');
    expect(notes.map((n) => n.id)).toEqual(ids);
  });
  it('is null when only a differently titled or untagged note exists', () => {
    expect(findThesisNote([note('1', 'Thesis: TCS', null, '2026-01-01'), note('2', 'About TCS', 'TCS', '2026-01-01')], 'TCS')).toBeNull();
  });
});

describe('entrySnapshot', () => {
  it('is the newest buy, ignoring other events', () => {
    expect(entrySnapshot([snap('1', 'buy', '2026-01-01'), snap('2', 'add_more', '2026-06-01'), snap('3', 'buy', '2026-03-01')])?.id).toBe('3');
  });
  it('is null with no buy', () => expect(entrySnapshot([snap('1', 'trim', '2026-01-01')])).toBeNull());
});

describe('pnlPct', () => {
  it('is the return on cost', () => expect(pnlPct(100, 150)).toBe(50));
  it('is null without a price or a cost', () => {
    expect(pnlPct(100, null)).toBeNull();
    expect(pnlPct(0, 10)).toBeNull();
  });
});
