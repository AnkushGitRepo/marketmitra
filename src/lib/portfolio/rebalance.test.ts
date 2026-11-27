import { describe, expect, it } from 'vitest';
import type { HoldingLike } from './portfolioMetrics';
import { simulateWhatIf, withCashSlice } from './rebalance';

const h = (symbol: string, sector: string | null, quantity: number, ltp: number | null): HoldingLike => ({
  symbol, name: symbol, quantity, avgPrice: ltp ?? 1, ltp, sector, dayChange: null,
});
// Banks 600, IT 300, Pharma 100 => equity 1000.
const book = [h('HDFC', 'Banks', 6, 100), h('INFY', 'IT', 3, 100), h('SUN', 'Pharma', 1, 100)];

describe('simulateWhatIf', () => {
  it('reports the starting point unchanged when there are no legs', () => {
    const r = simulateWhatIf(book, 0, []);
    expect(r.after).toEqual(r.before);
    expect(r.before.topSector).toEqual({ name: 'Banks', pct: 60 });
    expect(r.before.largest).toEqual({ symbol: 'HDFC', pct: 60 });
  });

  it('adding fresh money to another sector dilutes the concentrated one', () => {
    const r = simulateWhatIf(book, 0, [{ kind: 'add', symbol: 'NIFTYBEES', amount: 1000, sector: 'Index' }]);
    expect(r.after.equity).toBe(2000);
    expect(r.after.sectors.find((s) => s.name === 'Banks')?.pct).toBeCloseTo(30);
    expect(r.after.sectors.find((s) => s.name === 'Index')?.pct).toBeCloseTo(50);
  });

  it('adding to a held stock keeps its own sector', () => {
    const r = simulateWhatIf(book, 0, [{ kind: 'add', symbol: 'infy', amount: 100 }]);
    expect(r.after.sectors.find((s) => s.name === 'IT')?.pct).toBeCloseTo((400 / 1100) * 100);
  });

  it('trimming moves the proceeds to cash and lowers the sector share', () => {
    const r = simulateWhatIf(book, 0, [{ kind: 'trim', symbol: 'HDFC', shares: 2 }]);
    expect(r.after.equity).toBe(800);
    expect(r.after.cash).toBe(200);
    expect(r.after.total).toBe(1000);
    expect(r.after.cashPct).toBeCloseTo(20);
    expect(r.after.topSector?.pct).toBeCloseTo(50);
  });

  it('funding an add from cash takes the cash down, capped at what is there', () => {
    const r = simulateWhatIf(book, 300, [{ kind: 'add', symbol: 'SUN', amount: 500, fromCash: true }]);
    expect(r.after.cash).toBe(0);
    expect(r.after.equity).toBe(1300);
    expect(r.warnings.join(' ')).toMatch(/only ₹300/);
  });

  it('warns instead of guessing on a bad leg', () => {
    const r = simulateWhatIf(book, 0, [
      { kind: 'trim', symbol: 'NOPE', shares: 1 },
      { kind: 'trim', symbol: 'SUN', shares: 5 },
      { kind: 'add', symbol: 'SUN', amount: 0 },
    ]);
    expect(r.warnings).toHaveLength(3);
    expect(r.after.equity).toBe(900);
  });

  it('copes with an empty book and with unpriced holdings', () => {
    expect(simulateWhatIf([], 0, []).before.topSector).toBeNull();
    expect(simulateWhatIf([h('X', 'IT', 1, null)], 0, []).before.equity).toBe(0);
  });

  it('does not change its inputs', () => {
    const copy = JSON.stringify(book);
    simulateWhatIf(book, 100, [{ kind: 'trim', symbol: 'HDFC', shares: 1 }]);
    expect(JSON.stringify(book)).toBe(copy);
  });
});

describe('withCashSlice', () => {
  it('scales the sectors to make room for cash', () => {
    const out = withCashSlice([{ name: 'IT', value: 300, pct: 100 }], 100);
    expect(out).toEqual([{ name: 'IT', value: 300, pct: 75 }, { name: 'Cash', value: 100, pct: 25 }]);
  });
  it('leaves the sectors alone with no cash', () => {
    expect(withCashSlice([{ name: 'IT', value: 300, pct: 100 }], 0)).toEqual([{ name: 'IT', value: 300, pct: 100 }]);
  });
});
