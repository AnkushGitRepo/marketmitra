import { describe, expect, it } from 'vitest';
import { spreadTags } from './tagLayout';

describe('spreadTags', () => {
  it('leaves tags that already have room where they are', () => {
    expect(spreadTags([20, 60, 100], 18, 0, 200)).toEqual([20, 60, 100]);
  });

  it('pushes overlapping tags apart by at least the gap, keeping their order', () => {
    const out = spreadTags([100, 104, 108], 18, 0, 400);
    expect(out[1] - out[0]).toBeGreaterThanOrEqual(18);
    expect(out[2] - out[1]).toBeGreaterThanOrEqual(18);
    expect(out[0]).toBeLessThanOrEqual(100);
  });

  it('returns positions in the input order even when the input is not sorted', () => {
    const out = spreadTags([108, 100, 104], 18, 0, 400);
    expect(out[1]).toBeLessThan(out[2]);
    expect(out[2]).toBeLessThan(out[0]);
    expect(out[0] - out[1]).toBeGreaterThanOrEqual(36);
  });

  it('keeps every tag inside the pane, shifting the cluster up at the bottom edge', () => {
    const out = spreadTags([195, 198, 200], 18, 0, 200);
    expect(Math.max(...out)).toBeLessThanOrEqual(200);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0);
    expect(out[1] - out[0]).toBeGreaterThanOrEqual(18);
  });

  it('handles none and one', () => {
    expect(spreadTags([], 18, 0, 200)).toEqual([]);
    expect(spreadTags([500], 18, 0, 200)).toEqual([200]);
  });
});
