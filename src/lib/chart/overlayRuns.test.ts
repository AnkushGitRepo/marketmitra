import { describe, expect, it } from 'vitest';
import type { ChartOverlay } from './aiOverlay';
import {
  MAX_RUNS_PER_VIEW,
  describeRun,
  anchorBarTime,
  idsToPrune,
  runForMode,
  type OverlayRun,
} from './overlayRuns';

const overlay: ChartOverlay = {
  levels: [
    { kind: 'support', price: 150, label: 'S1' },
    { kind: 'resistance', price: 170, label: 'R1' },
  ],
  trendlines: [],
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
  setupNote: 'x',
};
const run = (over: Partial<OverlayRun> = {}): OverlayRun => ({
  id: 'r1',
  symbol: 'ACC',
  interval: '1d',
  mode: 'unrestricted',
  overlay,
  model: 'm',
  lastClose: 160,
  createdAt: '2026-11-17T05:30:00.000Z',
  ...over,
});

describe('runForMode', () => {
  it('keeps a saved trade setup for a caller in unrestricted mode', () => {
    expect(runForMode(run(), 'unrestricted').overlay.setup).toBeDefined();
  });
  it('strips the setup and its note for a guarded caller, even from an old unrestricted run', () => {
    const r = runForMode(run(), 'guarded');
    expect(r.overlay.setup).toBeUndefined();
    expect(r.overlay.setupNote).toBeUndefined();
    expect(r.overlay.levels).toHaveLength(2);
  });
  it('does not change the run it was given', () => {
    const original = run();
    runForMode(original, 'guarded');
    expect(original.overlay.setup).toBeDefined();
  });
});

describe('idsToPrune', () => {
  const ids = Array.from({ length: 13 }, (_, i) => `id${i}`); // newest first
  it('keeps the newest MAX_RUNS_PER_VIEW and returns the older ones', () => {
    expect(MAX_RUNS_PER_VIEW).toBe(10);
    expect(idsToPrune(ids)).toEqual(['id10', 'id11', 'id12']);
  });
  it('prunes nothing when within the limit', () => {
    expect(idsToPrune(ids.slice(0, 10))).toEqual([]);
    expect(idsToPrune([])).toEqual([]);
  });
});

describe('describeRun', () => {
  const now = new Date('2026-11-19T10:00:00.000Z');
  it('says how long ago and what it found', () => {
    const d = describeRun(run(), now);
    expect(d.when).toBe('2 days ago');
    expect(d.summary).toBe('2 levels · long setup');
    expect(d.price).toBe('₹160');
  });
  it('uses hours or minutes for a recent run', () => {
    expect(describeRun(run({ createdAt: '2026-11-19T07:00:00.000Z' }), now).when).toBe(
      '3 hours ago',
    );
    expect(describeRun(run({ createdAt: '2026-11-19T09:40:00.000Z' }), now).when).toBe(
      '20 minutes ago',
    );
    expect(describeRun(run({ createdAt: '2026-11-19T09:59:40.000Z' }), now).when).toBe('just now');
  });
  it('leaves the setup out of the summary when there is none', () => {
    expect(describeRun(run({ overlay: { ...overlay, setup: undefined } }), now).summary).toBe(
      '2 levels',
    );
    expect(
      describeRun(
        run({
          overlay: {
            levels: [],
            trendlines: [{ a: { time: 'a', price: 1 }, b: { time: 'b', price: 2 } }],
            indicators: [],
          },
        }),
        now,
      ).summary,
    ).toBe('1 trendline');
  });
});

describe('anchorBarTime', () => {
  const bar = (time: string) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 0 });
  // 09:15 IST = 03:45Z; intraday bar times are epoch seconds shifted +5:30.
  const at = (isoUtc: string) => String(Date.parse(isoUtc) / 1000 + 19_800);

  it('picks the intraday bar the run was created in, not the latest', () => {
    const bars = [
      bar(at('2026-11-19T09:30:00Z')),
      bar(at('2026-11-19T09:31:00Z')),
      bar(at('2026-11-19T09:40:00Z')),
      bar(at('2026-11-19T09:41:00Z')),
    ];
    expect(anchorBarTime(bars, '2026-11-19T09:40:30Z')).toBe(bars[2].time);
  });

  it('uses the first bar when the run predates the loaded data', () => {
    const bars = [bar(at('2026-11-19T09:30:00Z')), bar(at('2026-11-19T09:31:00Z'))];
    expect(anchorBarTime(bars, '2026-11-18T09:00:00Z')).toBe(bars[0].time);
  });

  it('uses the IST day for daily bars', () => {
    const bars = [bar('2026-11-16'), bar('2026-11-17'), bar('2026-11-18')];
    expect(anchorBarTime(bars, '2026-11-17T10:00:00Z')).toBe('2026-11-17');
  });

  it('is null for no bars', () => {
    expect(anchorBarTime([], '2026-11-17T10:00:00Z')).toBeNull();
  });
});
