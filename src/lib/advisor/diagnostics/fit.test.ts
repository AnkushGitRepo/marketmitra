import { describe, expect, it } from 'vitest';
import { HOLDINGS } from './fixtures';
import { checkFit } from './fit';

const base = { holdings: HOLDINGS, limits: { maxStockPct: 25, maxSectorPct: 50 }, excludedSectors: [], excludedTickers: [] };
const status = (r: ReturnType<typeof checkFit>, id: string) => r.checks.find((c) => c.id === id)?.status;

describe('checkFit', () => {
  it('passes a small addition in a light sector', () => {
    const r = checkFit({ ...base, symbol: 'new', sector: 'Energy', amountINR: 100 });
    expect(r.symbol).toBe('NEW');
    expect(status(r, 'stock-limit')).toBe('pass');
    expect(status(r, 'sector-limit')).toBe('pass');
    expect(r.breaches).toBe(0);
  });

  it('fails when adding would take a held stock past its limit', () => {
    const r = checkFit({ ...base, symbol: 'AAA', sector: 'Financials', amountINR: 500 });
    expect(status(r, 'stock-limit')).toBe('fail');
    expect(status(r, 'sector-limit')).toBe('fail');
    expect(r.breaches).toBe(2);
  });

  it('shows the weight before and after', () => {
    const r = checkFit({ ...base, symbol: 'AAA', sector: 'Financials', amountINR: 500 });
    expect(r.checks.find((c) => c.id === 'sector-limit')?.detail).toBe('Financials goes from 60.0% to 73.3% of the portfolio, against your 50% limit.');
  });

  it('fails an excluded ticker or sector', () => {
    expect(status(checkFit({ ...base, symbol: 'ZZZ', sector: 'Tobacco', amountINR: 100, excludedSectors: ['tobacco'] }), 'exclusion')).toBe('fail');
    expect(status(checkFit({ ...base, symbol: 'zzz', sector: null, amountINR: 100, excludedTickers: ['ZZZ'] }), 'exclusion')).toBe('fail');
    expect(status(checkFit({ ...base, symbol: 'ZZZ', sector: 'Energy', amountINR: 100 }), 'exclusion')).toBe('pass');
  });

  it('reports the sector check as unknown when the sector is not known', () => {
    expect(status(checkFit({ ...base, symbol: 'ZZZ', sector: null, amountINR: 100 }), 'sector-limit')).toBe('unknown');
  });

  it('mentions overlap with sectors already held', () => {
    const r = checkFit({ ...base, symbol: 'ZZZ', sector: 'Financials', amountINR: 10 });
    expect(r.checks.find((c) => c.id === 'overlap')?.detail).toContain('2 holdings');
  });
});
