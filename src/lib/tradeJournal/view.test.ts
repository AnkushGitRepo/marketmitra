import { describe, expect, it } from 'vitest';
import { groupBySymbol, outcomeFor } from './view';
import type { JournalSnapshot } from './types';

const snap = (over: Partial<JournalSnapshot>): JournalSnapshot => ({
  id: 'x', symbol: 'TCS', event: 'buy', at: '2026-01-01T00:00:00.000Z', before: null, after: { quantity: 1, avgPrice: 100 },
  marketPrice: 100, pe: null, roce: null, thesis: null, reason: null, guardrails: [], postMortem: null, ...over,
});

describe('groupBySymbol', () => {
  it('groups, orders groups by newest entry and flags held symbols, without mutating', () => {
    const input = [snap({ id: '1', symbol: 'A', at: '2026-01-01T00:00:00.000Z' }), snap({ id: '2', symbol: 'B', at: '2026-03-01T00:00:00.000Z' }), snap({ id: '3', symbol: 'A', at: '2026-05-01T00:00:00.000Z' })];
    const copy = JSON.stringify(input);
    const out = groupBySymbol(input, new Set(['B']));
    expect(out.map((g) => g.symbol)).toEqual(['A', 'B']);
    expect(out[0].entries.map((e) => e.id)).toEqual(['3', '1']);
    expect(out.map((g) => g.held)).toEqual([false, true]);
    expect(JSON.stringify(input)).toBe(copy);
  });
});

describe('outcomeFor', () => {
  it('measures a buy from the price then to now', () => expect(outcomeFor(snap({ marketPrice: 200 }), 100)?.pct).toBe(-50));
  it('has no number when a price is missing', () => {
    expect(outcomeFor(snap({ marketPrice: null }), 100)?.pct).toBeNull();
    expect(outcomeFor(snap({}), null)?.pct).toBeNull();
  });
  it('measures an exit from average cost to the live price when removed', () =>
    expect(outcomeFor(snap({ event: 'exit', before: { quantity: 1, avgPrice: 100 }, after: null, marketPrice: 150 }), null)?.pct).toBe(50));
  it('has no outcome for a trim or an edit', () => {
    expect(outcomeFor(snap({ event: 'trim' }), 10)).toBeNull();
    expect(outcomeFor(snap({ event: 'edit' }), 10)).toBeNull();
  });
});
