import { describe, expect, it } from 'vitest';
import { MAX_TICKERS } from './limits';
import { addTag, normalizeTag, removeTag } from './tags';

describe('normalizeTag', () => {
  it('upper-cases, drops a leading # and spaces, and accepts the characters some symbols carry', () => {
    expect(normalizeTag(' #bhartiartl ')).toBe('BHARTIARTL');
    expect(normalizeTag('m&m')).toBe('M&M');
    expect(normalizeTag('bajaj-auto')).toBe('BAJAJ-AUTO');
    expect(normalizeTag('NIFTY.BEES')).toBe('NIFTY.BEES');
  });
  it('refuses anything that is not a plausible symbol', () => {
    for (const bad of ['', '   ', '#', 'two words', '-X', 'a<b>', 'x'.repeat(31), '$$']) expect(normalizeTag(bad)).toBeNull();
  });
});

describe('addTag', () => {
  const note = { symbol: 'JPL' as string | null, tickers: ['IDEA'] };
  it('adds a normalised ticker after the others and leaves the symbol alone', () => {
    expect(addTag(note, '#bhartiartl')).toEqual({ ok: true, symbol: 'JPL', tickers: ['IDEA', 'BHARTIARTL'] });
  });
  it('says why it will not add a bad, repeated or surplus tag', () => {
    expect(addTag(note, 'not a symbol')).toMatchObject({ ok: false, error: expect.stringContaining('NSE symbol') });
    expect(addTag(note, 'jpl')).toMatchObject({ ok: false, error: 'JPL is already on this note.' }); // the symbol counts
    expect(addTag(note, 'idea')).toMatchObject({ ok: false, error: 'IDEA is already on this note.' });
    const full = { symbol: null, tickers: Array.from({ length: MAX_TICKERS }, (_, i) => `S${i}`) };
    expect(addTag(full, 'EXTRA')).toMatchObject({ ok: false, error: `A note can have up to ${MAX_TICKERS} tickers.` });
  });
  it('does not change the note it was given', () => {
    addTag(note, 'X');
    expect(note).toEqual({ symbol: 'JPL', tickers: ['IDEA'] });
  });
});

describe('removeTag', () => {
  it('clears the symbol when it is the symbol that is removed, and otherwise takes the ticker off the list', () => {
    expect(removeTag({ symbol: 'JPL', tickers: ['IDEA'] }, 'JPL')).toEqual({ ok: true, symbol: null, tickers: ['IDEA'] });
    expect(removeTag({ symbol: 'JPL', tickers: ['IDEA', 'BHARTIARTL'] }, 'IDEA')).toEqual({ ok: true, symbol: 'JPL', tickers: ['BHARTIARTL'] });
  });
});
