import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The dashboard's top gainers and losers must never show an SME stock (issue #216). They are
// built from the fixed WATCHLIST of large caps, so the guarantee is: nothing outside that list
// is ever quoted for movers, and nothing on it is an SME company.

const asked: string[][] = [];

vi.mock('./fundamentalsApi', () => ({
  getCompany: async () => null,
  getQuotes: async (symbols: string[]) => {
    asked.push(symbols);
    // A big SME mover leaking into the quotes must still be dropped.
    return symbols.map((s) => ({ symbol: s, price: 100, prev_close: 90, change_pct: s === 'RELIANCE' ? 11.1 : 1 }));
  },
}));

const { getTopMovers } = await import('./quotes');
const { WATCHLIST } = await import('./watchlist');

const SME_SYMBOLS = new Set(
  readFileSync(resolve(process.cwd(), 'services/fundamentals-api/app/data/SME_SYMBOLS.csv'), 'utf8')
    .split('\n')
    .slice(1)
    .map((line) => line.split(',')[0]?.trim().toUpperCase())
    .filter(Boolean),
);

beforeEach(() => {
  asked.length = 0;
});

describe('dashboard top movers never include SME', () => {
  it('the bundled SME list is loaded (so the checks below mean something)', () => {
    expect(SME_SYMBOLS.size).toBeGreaterThan(500);
  });

  it('no stock on the movers watchlist is an SME company', () => {
    expect(WATCHLIST.filter((w) => SME_SYMBOLS.has(w.symbol.toUpperCase()))).toEqual([]);
  });

  it('movers are drawn only from the watchlist symbols', async () => {
    const { gainers, losers } = await getTopMovers();
    const allowed = new Set(WATCHLIST.map((w) => w.symbol));
    expect([...gainers, ...losers].every((q) => allowed.has(q.symbol))).toBe(true);
    expect(asked.flat().every((s) => allowed.has(s))).toBe(true);
    expect([...gainers, ...losers].some((q) => SME_SYMBOLS.has(q.symbol))).toBe(false);
  });
});
