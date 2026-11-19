import { describe, expect, it } from 'vitest';
import type { ChartOverlay } from './aiOverlay';
import { isOverlayEmpty, overlayItems, removeOverlayItem } from './overlayItems';

const overlay: ChartOverlay = {
  levels: [
    { kind: 'support', price: 150, label: 'S1' },
    { kind: 'resistance', price: 170, label: 'R1' },
  ],
  trendlines: [{ a: { time: '2026-01-02', price: 100 }, b: { time: '2026-02-02', price: 140 } }],
  indicators: ['ema20'],
  setup: {
    direction: 'long',
    entry: 152,
    stop: 149,
    target: 170,
    riskReward: 6,
    stopPct: -2,
    targetPct: 11.8,
    entryType: 'pullback',
    lastClose: 160,
  },
};

describe('overlayItems', () => {
  it('lists each level, trendline and the trade setup with a stable id', () => {
    const items = overlayItems(overlay);
    expect(items.map((i) => i.id)).toEqual([
      'level:S1',
      'level:R1',
      'trend:2026-01-02|2026-02-02',
      'setup',
    ]);
    expect(items[0]).toMatchObject({ name: 'Support S1', detail: '₹150' });
    expect(items[2].name).toBe('Trendline');
    expect(items[3]).toMatchObject({ name: 'Long setup' });
    expect(items[3].detail).toContain('₹152');
  });
  it('lists nothing for an empty overlay', () => {
    expect(overlayItems({ levels: [], trendlines: [], indicators: [] })).toEqual([]);
  });
});

describe('removeOverlayItem', () => {
  it('removes one level and keeps everything else, without changing the input', () => {
    const next = removeOverlayItem(overlay, 'level:S1');
    expect(next.levels.map((l) => l.label)).toEqual(['R1']);
    expect(next.trendlines).toHaveLength(1);
    expect(next.setup).toBeDefined();
    expect(overlay.levels).toHaveLength(2);
  });
  it('removes the trendline by its id', () => {
    expect(removeOverlayItem(overlay, 'trend:2026-01-02|2026-02-02').trendlines).toEqual([]);
  });
  it('removes the setup together with its note', () => {
    const next = removeOverlayItem({ ...overlay, setupNote: 'x' }, 'setup');
    expect(next.setup).toBeUndefined();
    expect(next.setupNote).toBeUndefined();
  });
  it('ignores an unknown id', () => {
    expect(removeOverlayItem(overlay, 'nope')).toEqual(overlay);
  });
});

describe('isOverlayEmpty', () => {
  it('is true only when nothing is left to draw (recommended indicators do not count)', () => {
    expect(isOverlayEmpty(overlay)).toBe(false);
    expect(isOverlayEmpty({ levels: [], trendlines: [], indicators: ['ema20'] })).toBe(true);
    expect(
      isOverlayEmpty({ levels: [], trendlines: [], indicators: [], setupNote: 'why not' }),
    ).toBe(true);
  });
});
