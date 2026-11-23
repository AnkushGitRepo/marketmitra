import { describe, expect, it } from 'vitest';
import { parseHoldingInput } from './holdingInput';

describe('parseHoldingInput', () => {
  it('accepts a symbol, quantity and price, and normalises the symbol', () => {
    expect(parseHoldingInput({ symbol: ' tcs ', quantity: '10', avgPrice: '3,450.5' })).toEqual({
      ok: true,
      value: { symbol: 'TCS', quantity: 10, avgPrice: 3450.5 },
    });
  });
  it('asks for a stock when none is chosen', () => {
    expect(parseHoldingInput({ symbol: '', quantity: '1', avgPrice: '1' })).toEqual({ ok: false, error: 'Pick a stock from the search results.' });
  });
  it.each([['0'], ['-3'], ['abc'], ['']])('rejects quantity %j', (q) => {
    const r = parseHoldingInput({ symbol: 'TCS', quantity: q, avgPrice: '100' });
    expect(r).toEqual({ ok: false, error: 'Enter how many shares you hold (more than zero).' });
  });
  it('rejects a bad price', () => {
    expect(parseHoldingInput({ symbol: 'TCS', quantity: '2', avgPrice: '0' })).toEqual({ ok: false, error: 'Enter your average buy price (more than zero).' });
  });
  it('rejects fractional shares and absurd values', () => {
    expect(parseHoldingInput({ symbol: 'TCS', quantity: '2.5', avgPrice: '10' }).ok).toBe(false);
    expect(parseHoldingInput({ symbol: 'TCS', quantity: '1e12', avgPrice: '10' }).ok).toBe(false);
  });
});
