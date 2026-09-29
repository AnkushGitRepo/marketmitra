import { describe, expect, it } from 'vitest';
import {
  closeNSessionsAgo,
  decideAlertTransition,
  evaluate52WeekBreach,
  evaluateCumulativeDrawdown,
  evaluatePercentMove,
  evaluatePortfolioPnl,
  evaluatePriceThreshold,
  evaluateTrailingStop,
  snapshotFromQuote,
} from './evaluators';
import type { Alert, MarketSnapshot } from './types';

const snap = (over: Partial<MarketSnapshot> = {}): MarketSnapshot => ({
  price: 100,
  prevClose: 100,
  changePct: 0,
  week52High: 150,
  week52Low: 50,
  ...over,
});

describe('evaluatePriceThreshold', () => {
  it.each([
    ['above', 100, 100, true], // at the line counts
    ['above', 99.99, 100, false],
    ['above', 100.01, 100, true],
    ['below', 100, 100, true],
    ['below', 100.01, 100, false],
    ['below', 99.99, 100, true],
  ] as const)('direction=%s price=%s threshold=%s -> %s', (direction, price, threshold, want) => {
    const r = evaluatePriceThreshold({ direction, threshold }, snap({ price }));
    expect(r.triggered).toBe(want);
    expect(r.observedValue).toBe(price);
  });
});

describe('evaluatePercentMove', () => {
  it('returns null when there is no change% to measure', () => {
    expect(evaluatePercentMove({ direction: 'either', pct: 5 }, snap({ changePct: null }))).toBeNull();
    expect(evaluatePercentMove({ direction: 'up', pct: 5 }, snap({ changePct: NaN }))).toBeNull();
  });

  it.each([
    ['up', 5, 5, true],
    ['up', 5, 4.9, false],
    ['up', 5, -6, false],
    ['down', 5, -5, true],
    ['down', 5, -4.9, false],
    ['down', 5, 6, false],
    ['either', 5, 6, true],
    ['either', 5, -6, true],
    ['either', 5, 3, false],
  ] as const)('direction=%s pct=%s move=%s -> %s', (direction, pct, move, want) => {
    const r = evaluatePercentMove({ direction, pct }, snap({ changePct: move }));
    expect(r?.triggered).toBe(want);
    expect(r?.observedValue).toBe(move);
  });
});

describe('evaluate52WeekBreach', () => {
  it('returns null when the relevant extreme is unknown', () => {
    expect(evaluate52WeekBreach({ edge: 'high' }, snap({ week52High: null }))).toBeNull();
    expect(evaluate52WeekBreach({ edge: 'low' }, snap({ week52Low: null }))).toBeNull();
  });

  const breachTriggered = (
    params: Parameters<typeof evaluate52WeekBreach>[0],
    over: Partial<MarketSnapshot>
  ): boolean => {
    const r = evaluate52WeekBreach(params, snap(over));
    expect(r).not.toBeNull();
    return r!.triggered;
  };

  it('high breach: price at or above the 52w high', () => {
    expect(breachTriggered({ edge: 'high' }, { price: 150, week52High: 150 })).toBe(true);
    expect(breachTriggered({ edge: 'high' }, { price: 149.9, week52High: 150 })).toBe(false);
  });

  it('high "within X%": triggers below the high by the margin', () => {
    // within 5% of 150 => trigger at 142.5
    expect(breachTriggered({ edge: 'high', withinPct: 5 }, { price: 143, week52High: 150 })).toBe(true);
    expect(breachTriggered({ edge: 'high', withinPct: 5 }, { price: 142, week52High: 150 })).toBe(false);
  });

  it('low breach and "within X%": triggers at or above the low by the margin', () => {
    expect(breachTriggered({ edge: 'low' }, { price: 50, week52Low: 50 })).toBe(true);
    // within 5% of 50 => trigger at 52.5
    expect(breachTriggered({ edge: 'low', withinPct: 5 }, { price: 52, week52Low: 50 })).toBe(true);
    expect(breachTriggered({ edge: 'low', withinPct: 5 }, { price: 53, week52Low: 50 })).toBe(false);
  });
});

describe('evaluateTrailingStop', () => {
  it('seeds the peak from the current price on the first evaluation and does not trigger', () => {
    const { result, peakPrice } = evaluateTrailingStop({ trailPct: 10 }, 100, null);
    expect(peakPrice).toBe(100);
    expect(result.triggered).toBe(false);
  });

  it('ratchets the peak up as the price rises, never down', () => {
    expect(evaluateTrailingStop({ trailPct: 10 }, 120, 100).peakPrice).toBe(120);
    expect(evaluateTrailingStop({ trailPct: 10 }, 90, 120).peakPrice).toBe(120);
  });

  it('triggers once price falls trailPct% below the peak, not below the original entry', () => {
    // Peak ran up to 200; a 10% trail means the floor is 180, not the
    // original purchase price this alert never even knows.
    const atFloor = evaluateTrailingStop({ trailPct: 10 }, 180, 200);
    expect(atFloor.result.triggered).toBe(true);
    expect(atFloor.peakPrice).toBe(200);

    const aboveFloor = evaluateTrailingStop({ trailPct: 10 }, 181, 200);
    expect(aboveFloor.result.triggered).toBe(false);
  });
});

describe('evaluateCumulativeDrawdown', () => {
  it('returns null with no history to compare against', () => {
    expect(evaluateCumulativeDrawdown({ windowSessions: 4, pct: 15 }, 100, null)).toBeNull();
    expect(evaluateCumulativeDrawdown({ windowSessions: 4, pct: 15 }, 100, 0)).toBeNull();
  });

  it('triggers on a slow multi-session bleed even without one dramatic single day', () => {
    // 100 -> 60 over the window is -40%, well past a 15% threshold, even
    // though each individual session's move might look unremarkable.
    const r = evaluateCumulativeDrawdown({ windowSessions: 4, pct: 15 }, 60, 100);
    expect(r).not.toBeNull();
    expect(r!.triggered).toBe(true);
    expect(r!.observedValue).toBeCloseTo(-40, 5);
  });

  it('does not trigger on a rise, or a fall smaller than the threshold', () => {
    expect(evaluateCumulativeDrawdown({ windowSessions: 4, pct: 15 }, 110, 100)!.triggered).toBe(false);
    expect(evaluateCumulativeDrawdown({ windowSessions: 4, pct: 15 }, 90, 100)!.triggered).toBe(false);
  });
});

describe('closeNSessionsAgo', () => {
  const bars = (closes: number[]) =>
    closes.map((close, i) => ({ trade_date: `2026-01-${String(i + 1).padStart(2, '0')}`, close: String(close) }));

  it('picks the close windowSessions back from the most recent bar', () => {
    // 5 bars, most recent (idx 4) is "today"; 4 sessions back is idx 0.
    expect(closeNSessionsAgo(bars([100, 105, 95, 90, 60]), 4)).toBe(100);
    expect(closeNSessionsAgo(bars([100, 105, 95, 90, 60]), 1)).toBe(90);
  });

  it('is order-independent (sorts by trade_date itself)', () => {
    const shuffled = [
      { trade_date: '2026-01-05', close: '60' },
      { trade_date: '2026-01-01', close: '100' },
      { trade_date: '2026-01-03', close: '95' },
      { trade_date: '2026-01-02', close: '105' },
      { trade_date: '2026-01-04', close: '90' },
    ];
    expect(closeNSessionsAgo(shuffled, 4)).toBe(100);
  });

  it('returns null when there is not enough history yet', () => {
    expect(closeNSessionsAgo(bars([100, 105]), 4)).toBeNull();
  });

  it('returns null on a missing or non-positive close', () => {
    expect(closeNSessionsAgo([{ trade_date: '2026-01-01', close: null }, { trade_date: '2026-01-02', close: '10' }], 1)).toBeNull();
  });
});

describe('evaluatePortfolioPnl', () => {
  const metrics = { totalValue: 120_000, unrealizedPnl: 20_000, unrealizedPnlPct: 20 };

  it.each([
    ['total_value', 'above', 100_000, true, 120_000],
    ['total_value', 'below', 100_000, false, 120_000],
    ['unrealized_pnl', 'below', 0, false, 20_000],
    ['unrealized_pnl_pct', 'above', 25, false, 20],
    ['unrealized_pnl_pct', 'above', 20, true, 20],
  ] as const)('metric=%s %s %s -> %s', (metric, direction, threshold, want, observed) => {
    const r = evaluatePortfolioPnl({ metric, direction, threshold }, metrics);
    expect(r.triggered).toBe(want);
    expect(r.observedValue).toBe(observed);
  });
});

describe('snapshotFromQuote', () => {
  it('maps string fields to numbers', () => {
    expect(
      snapshotFromQuote({
        price: '100.5',
        prev_close: '99',
        change_pct: '1.5152',
        week52_high: '150',
        week52_low: '50',
      })
    ).toEqual({ price: 100.5, prevClose: 99, changePct: 1.5152, week52High: 150, week52Low: 50 });
  });

  it('returns null with no usable last price', () => {
    expect(snapshotFromQuote({ price: null, prev_close: '99', change_pct: null, week52_high: null, week52_low: null })).toBeNull();
    expect(snapshotFromQuote({ price: 'n/a', prev_close: null, change_pct: null, week52_high: null, week52_low: null })).toBeNull();
  });

  it('keeps a usable price even when the other fields are missing', () => {
    expect(
      snapshotFromQuote({ price: '100', prev_close: null, change_pct: null, week52_high: null, week52_low: null })
    ).toEqual({ price: 100, prevClose: null, changePct: null, week52High: null, week52Low: null });
  });
});

// --- the state machine ---------------------------------------------------

type TransitionAlert = Pick<Alert, 'status' | 'rearm' | 'cooldownMinutes' | 'armed' | 'cooldownUntil'>;

const baseAlert = (over: Partial<TransitionAlert> = {}): TransitionAlert => ({
  status: 'active',
  rearm: false,
  cooldownMinutes: 60,
  armed: true,
  cooldownUntil: null,
  ...over,
});

const NOW = new Date('2026-09-06T10:00:00.000Z');
const fired = { triggered: true, observedValue: 1 };
const quiet = { triggered: false, observedValue: 1 };

describe('decideAlertTransition', () => {
  it('null result is a no-op beyond the timestamp', () => {
    const t = decideAlertTransition(baseAlert(), null, NOW);
    expect(t.notify).toBe(false);
    expect(t.patch.lastEvaluatedAt).toEqual(NOW);
    expect(t.patch).not.toHaveProperty('lastObservedValue');
  });

  it('skips entirely when the alert is not active', () => {
    for (const status of ['triggered', 'paused'] as const) {
      const t = decideAlertTransition(baseAlert({ status }), fired, NOW);
      expect(t.notify).toBe(false);
      expect(t.patch).not.toHaveProperty('status');
    }
  });

  it('one-shot: fires once then goes to triggered', () => {
    const t = decideAlertTransition(baseAlert({ rearm: false }), fired, NOW);
    expect(t.notify).toBe(true);
    expect(t.patch.status).toBe('triggered');
    expect(t.patch.triggeredAt).toEqual(NOW);
  });

  it('one-shot: not-triggered just records the observed value', () => {
    const t = decideAlertTransition(baseAlert({ rearm: false }), quiet, NOW);
    expect(t.notify).toBe(false);
    expect(t.patch.lastObservedValue).toBe(1);
    expect(t.patch).not.toHaveProperty('status');
  });

  it('rearm: fires, disarms, and sets a cooldown', () => {
    const t = decideAlertTransition(baseAlert({ rearm: true, cooldownMinutes: 30 }), fired, NOW);
    expect(t.notify).toBe(true);
    expect(t.patch.armed).toBe(false);
    expect(t.patch.status).toBeUndefined(); // stays active
    expect(t.patch.cooldownUntil).toEqual(new Date(NOW.getTime() + 30 * 60_000));
  });

  it('rearm: still-triggered while disarmed does not re-fire', () => {
    const t = decideAlertTransition(
      baseAlert({ rearm: true, armed: false, cooldownUntil: new Date(NOW.getTime() - 1) }),
      fired,
      NOW
    );
    expect(t.notify).toBe(false);
  });

  it('rearm: re-arms only after the condition goes false AND the cooldown elapses', () => {
    const still = decideAlertTransition(
      baseAlert({ rearm: true, armed: false, cooldownUntil: new Date(NOW.getTime() + 60_000) }),
      quiet,
      NOW
    );
    expect(still.patch.armed).toBeUndefined(); // cooldown not up yet

    const ready = decideAlertTransition(
      baseAlert({ rearm: true, armed: false, cooldownUntil: new Date(NOW.getTime() - 60_000) }),
      quiet,
      NOW
    );
    expect(ready.patch.armed).toBe(true);
    expect(ready.patch.cooldownUntil).toBeNull();
    expect(ready.notify).toBe(false);
  });

  it('rearm: fires again once re-armed', () => {
    const t = decideAlertTransition(baseAlert({ rearm: true, armed: true, cooldownUntil: null }), fired, NOW);
    expect(t.notify).toBe(true);
    expect(t.patch.armed).toBe(false);
  });
});
