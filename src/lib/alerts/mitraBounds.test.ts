import { describe, expect, it } from 'vitest';
import { checkMitraBounds } from './mitraBounds';

describe('checkMitraBounds', () => {
  it('accepts a trailing_stop within 3-25%, rejects outside it', () => {
    expect(checkMitraBounds('trailing_stop', { trailPct: 3 })).toBeNull();
    expect(checkMitraBounds('trailing_stop', { trailPct: 25 })).toBeNull();
    expect(checkMitraBounds('trailing_stop', { trailPct: 2.9 })).toMatch(/between 3% and 25%/);
    expect(checkMitraBounds('trailing_stop', { trailPct: 25.1 })).toMatch(/between 3% and 25%/);
  });

  it('accepts a cumulative_drawdown within 2-10 sessions and 5-50%, rejects outside either', () => {
    expect(checkMitraBounds('cumulative_drawdown', { windowSessions: 4, pct: 15 })).toBeNull();
    expect(checkMitraBounds('cumulative_drawdown', { windowSessions: 1, pct: 15 })).toMatch(/2 and 10 sessions/);
    expect(checkMitraBounds('cumulative_drawdown', { windowSessions: 4, pct: 4 })).toMatch(/between 5% and 50%/);
  });

  it('accepts a percent_move within 1-50%, rejects outside it', () => {
    expect(checkMitraBounds('percent_move', { direction: 'down', pct: 5 })).toBeNull();
    expect(checkMitraBounds('percent_move', { direction: 'down', pct: 0.5 })).toMatch(/between 1% and 50%/);
  });

  it('accepts a week52_breach margin within 0-20%, treats missing withinPct as 0', () => {
    expect(checkMitraBounds('week52_breach', { edge: 'high' })).toBeNull();
    expect(checkMitraBounds('week52_breach', { edge: 'high', withinPct: 20 })).toBeNull();
    expect(checkMitraBounds('week52_breach', { edge: 'high', withinPct: 20.1 })).toMatch(/between 0% and 20%/);
  });

  it('does not bound price_threshold or portfolio_pnl (inherently symbol/portfolio-specific)', () => {
    expect(checkMitraBounds('price_threshold', { direction: 'below', threshold: 1 })).toBeNull();
    expect(checkMitraBounds('price_threshold', { direction: 'below', threshold: 999999 })).toBeNull();
    expect(checkMitraBounds('portfolio_pnl', { metric: 'total_value', direction: 'below', threshold: -1e9 })).toBeNull();
  });

  it('rejects an IPO alert type outright — Mitra cannot manage those', () => {
    expect(checkMitraBounds('ipo_watch', {})).toMatch(/cannot manage alerts/);
    expect(checkMitraBounds('ipo', {})).toMatch(/cannot manage alerts/);
  });
});
