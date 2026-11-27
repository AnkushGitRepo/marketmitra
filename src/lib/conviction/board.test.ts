import { describe, expect, it } from 'vitest';
import { buildBoard, describeTarget, targetReached, type ConvictionEntry } from './board';
import { convictionInputSchema } from './schema';

const entry = (over: Partial<ConvictionEntry>): ConvictionEntry => ({
  id: 'x', symbol: 'AAA', tag: 'tracking', waitFor: null, targetPrice: null, targetDirection: 'at_or_below', noteId: null, ...over,
});

describe('targetReached', () => {
  it('treats the target itself as reached in both directions', () => {
    expect(targetReached(100, 100, 'at_or_below')).toBe(true);
    expect(targetReached(100, 100, 'at_or_above')).toBe(true);
  });
  it('respects the direction', () => {
    expect(targetReached(90, 100, 'at_or_below')).toBe(true);
    expect(targetReached(110, 100, 'at_or_below')).toBe(false);
    expect(targetReached(110, 100, 'at_or_above')).toBe(true);
  });
});

describe('describeTarget', () => {
  it('has no target', () => expect(describeTarget(100, null, 'at_or_below')).toEqual({ state: 'no_target', distancePct: null }));
  it('has no usable price', () => {
    expect(describeTarget(null, 90, 'at_or_below').state).toBe('no_price');
    expect(describeTarget(0, 90, 'at_or_below').state).toBe('no_price');
  });
  it('measures distance as a share of the current price', () => {
    const r = describeTarget(100, 90, 'at_or_below');
    expect(r.state).toBe('waiting');
    expect(r.distancePct).toBeCloseTo(10);
  });
  it('is near within 5 percent', () => expect(describeTarget(100, 96, 'at_or_below').state).toBe('near'));
  it('is reached at zero distance', () => expect(describeTarget(80, 90, 'at_or_below')).toEqual({ state: 'reached', distancePct: 0 }));
});

describe('buildBoard', () => {
  it('orders by conviction, then proximity, and does not mutate its input', () => {
    const entries = [
      entry({ id: '1', symbol: 'T1', tag: 'tracking', targetPrice: 99 }),
      entry({ id: '2', symbol: 'H1', tag: 'high', targetPrice: 50 }),
      entry({ id: '3', symbol: 'H2', tag: 'high', targetPrice: 98 }),
      entry({ id: '4', symbol: 'W1', tag: 'wait' }),
    ];
    const copy = JSON.stringify(entries);
    const rows = buildBoard(entries, { T1: 100, H1: 100, H2: 100, W1: 100 });
    expect(rows.map((r) => r.id)).toEqual(['3', '2', '4', '1']);
    expect(JSON.stringify(entries)).toBe(copy);
  });
  it('marks missing quotes', () => expect(buildBoard([entry({ targetPrice: 10 })], {})[0].state).toBe('no_price'));
});

describe('convictionInputSchema', () => {
  it('upper-cases the symbol', () => expect(convictionInputSchema.parse({ symbol: ' tcs ' }).symbol).toBe('TCS'));
  it('rejects a non-positive target', () => expect(convictionInputSchema.safeParse({ symbol: 'TCS', targetPrice: 0 }).success).toBe(false));
  it('accepts null to clear the target', () => expect(convictionInputSchema.parse({ symbol: 'TCS', targetPrice: null }).targetPrice).toBeNull());
  it('allows waitFor only with the wait tag', () => {
    expect(convictionInputSchema.safeParse({ symbol: 'TCS', tag: 'high', waitFor: 'Q3 results' }).success).toBe(false);
    expect(convictionInputSchema.safeParse({ symbol: 'TCS', tag: 'wait', waitFor: 'Q3 results' }).success).toBe(true);
  });
});
