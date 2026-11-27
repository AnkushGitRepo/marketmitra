import { describe, expect, it } from 'vitest';
import { classifyEvent, cleanText, parseRatio, pickThesisNote, ratioNamed, returnPct, MAX_THESIS_BODY } from './snapshot';

const h = (quantity: number, avgPrice = 100) => ({ quantity, avgPrice });

describe('classifyEvent', () => {
  it('covers every kind of change', () => {
    expect(classifyEvent(null, h(10))).toBe('buy');
    expect(classifyEvent(h(10), h(15))).toBe('add_more');
    expect(classifyEvent(h(10), h(4))).toBe('trim');
    expect(classifyEvent(h(10, 100), h(10, 90))).toBe('edit');
    expect(classifyEvent(h(10), null)).toBe('exit');
  });
});

describe('parseRatio / ratioNamed', () => {
  it('reads plain, comma and missing values', () => {
    expect(parseRatio('23.4')).toBe(23.4);
    expect(parseRatio('1,204.5')).toBe(1204.5);
    expect(parseRatio(null)).toBeNull();
    expect(parseRatio('n/a')).toBeNull();
  });
  it('finds a ratio by name, trying alternatives, never inventing one', () => {
    const ratios = [{ name: 'Stock P/E', value: '18.2' }, { name: 'ROCE', value: null }];
    expect(ratioNamed(ratios, ['Stock P/E'])).toBe(18.2);
    expect(ratioNamed(ratios, ['ROCE', 'Return on capital employed'])).toBeNull();
  });
});

describe('pickThesisNote', () => {
  const note = (id: string, symbol: string | null, tickers: string[], day: number, body = 'why') => ({
    id, title: `t${id}`, body, symbol, tickers, updatedAt: new Date(2026, 0, day),
  });
  it('picks the newest note naming the symbol, by symbol or tag', () => {
    const notes = [note('a', 'TCS', [], 1), note('b', null, ['tcs'], 5), note('c', 'INFY', [], 9)];
    expect(pickThesisNote(notes, 'TCS')?.noteId).toBe('b');
  });
  it('returns null when no note names it', () => expect(pickThesisNote([note('a', 'INFY', [], 1)], 'TCS')).toBeNull());
  it('caps the copied body and does not reorder the input', () => {
    const notes = [note('a', 'TCS', [], 1, 'x'.repeat(MAX_THESIS_BODY + 50)), note('b', 'TCS', [], 0)];
    const ids = notes.map((n) => n.id);
    expect(pickThesisNote(notes, 'TCS')?.body).toHaveLength(MAX_THESIS_BODY);
    expect(notes.map((n) => n.id)).toEqual(ids);
  });
});

describe('returnPct', () => {
  it('computes percent change', () => expect(returnPct(100, 150)).toBe(50));
  it('is null on missing or non-positive entry', () => {
    expect(returnPct(null, 10)).toBeNull();
    expect(returnPct(100, null)).toBeNull();
    expect(returnPct(0, 10)).toBeNull();
  });
});

describe('cleanText', () => {
  it('trims, caps and drops empties', () => {
    expect(cleanText('  hi  ', 10)).toBe('hi');
    expect(cleanText('abcdef', 3)).toBe('abc');
    expect(cleanText('   ', 3)).toBeNull();
    expect(cleanText(undefined, 3)).toBeNull();
  });
});
