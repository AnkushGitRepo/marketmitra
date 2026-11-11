import { describe, expect, it } from 'vitest';
import type { Alert } from '@/lib/alerts/types';
import {
  alertFacts,
  alertGroup,
  alertTitle,
  defaultTab,
  filterAlerts,
  guardrailBanner,
  isRecentlyTriggered,
  splitSections,
  tabCounts,
  visibleTabs,
} from './alertView';

const NOW = new Date('2026-11-11T06:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const alert = (over: Partial<Alert>): Alert => ({
  id: 'a', userId: 'u', type: 'price_threshold', symbol: 'TCS', params: { direction: 'below', threshold: 2300 }, note: null,
  status: 'active', rearm: false, cooldownMinutes: 60, armed: true, cooldownUntil: null, lastEvaluatedAt: null, triggeredAt: null,
  lastObservedValue: null, sentKeys: null, peakPrice: null, source: 'user', createdAt: NOW, updatedAt: NOW, ...over,
});

describe('alertGroup', () => {
  it('puts every kind of fall protection under Stop-loss', () => {
    expect(alertGroup(alert({}))).toBe('stop');
    expect(alertGroup(alert({ type: 'trailing_stop', params: { trailPct: 10 } }))).toBe('stop');
    expect(alertGroup(alert({ type: 'cumulative_drawdown', params: { windowSessions: 4, pct: 15 } }))).toBe('stop');
  });
  it('sorts the rest', () => {
    expect(alertGroup(alert({ params: { direction: 'above', threshold: 3500 } }))).toBe('target');
    expect(alertGroup(alert({ type: 'percent_move', params: { direction: 'up', pct: 5 } }))).toBe('moves');
    expect(alertGroup(alert({ type: 'week52_breach', params: { edge: 'high' } }))).toBe('moves');
    expect(alertGroup(alert({ type: 'portfolio_pnl', params: { metric: 'total_value', direction: 'below', threshold: 1 } }))).toBe('portfolio');
    expect(alertGroup(alert({ type: 'ipo', symbol: null, params: { ipoSlug: 'x', trigger: 'opens' } }))).toBe('ipo');
    expect(alertGroup(alert({ type: 'ipo_watch', symbol: null, params: { triggers: { opens: true, lastDay: false, allotmentListing: false }, ipoType: 'all' } }))).toBe('ipo');
  });
});

describe('tabs', () => {
  const list = [alert({ id: '1', status: 'triggered' }), alert({ id: '2', status: 'triggered' })];
  it('counts by status', () => {
    expect(tabCounts(list)).toEqual({ active: 0, triggered: 2, paused: 0, all: 2 });
  });
  it('opens on Active when something is watched, else on the first tab with content', () => {
    expect(defaultTab({ active: 1, triggered: 5, paused: 0, all: 6 })).toBe('active');
    expect(defaultTab({ active: 0, triggered: 2, paused: 3, all: 5 })).toBe('triggered');
    expect(defaultTab({ active: 0, triggered: 0, paused: 3, all: 3 })).toBe('paused');
    expect(defaultTab({ active: 0, triggered: 0, paused: 0, all: 0 })).toBe('all');
  });
  it('hides empty tabs unless active, and always keeps All', () => {
    expect(visibleTabs({ active: 0, triggered: 2, paused: 0, all: 2 }, 'triggered')).toEqual(['triggered', 'all']);
    expect(visibleTabs({ active: 0, triggered: 2, paused: 0, all: 2 }, 'active')).toEqual(['active', 'triggered', 'all']);
  });
});

describe('filterAlerts', () => {
  const list = [
    alert({ id: '1', symbol: 'TCS', status: 'triggered' }),
    alert({ id: '2', symbol: 'INFY', status: 'active', params: { direction: 'above', threshold: 2000 } }),
    alert({ id: '3', symbol: 'TCS', status: 'paused', note: 'watch results' }),
  ];
  const ids = (q: Parameters<typeof filterAlerts>[1]) => filterAlerts(list, q).map((a) => a.id);
  it('combines tab, group and text', () => {
    expect(ids({ tab: 'all', group: 'all', text: '' })).toEqual(['1', '2', '3']);
    expect(ids({ tab: 'triggered', group: 'all', text: '' })).toEqual(['1']);
    expect(ids({ tab: 'all', group: 'target', text: '' })).toEqual(['2']);
    expect(ids({ tab: 'all', group: 'all', text: 'tcs' })).toEqual(['1', '3']);
    expect(ids({ tab: 'all', group: 'all', text: 'results' })).toEqual(['3']);
    expect(ids({ tab: 'active', group: 'stop', text: '' })).toEqual([]);
  });
});

describe('splitSections', () => {
  it('separates recent triggers (need attention) from old ones (resolved), newest first', () => {
    const s = splitSections(
      [
        alert({ id: 'old', status: 'triggered', triggeredAt: daysAgo(60) }),
        alert({ id: 'recent-b', status: 'triggered', triggeredAt: daysAgo(1) }),
        alert({ id: 'recent-a', status: 'triggered', triggeredAt: daysAgo(3) }),
        alert({ id: 'watching', status: 'active' }),
        alert({ id: 'p', status: 'paused' }),
      ],
      NOW
    );
    expect(s.attention.map((a) => a.id)).toEqual(['recent-b', 'recent-a']);
    expect(s.resolved.map((a) => a.id)).toEqual(['old']);
    expect(s.monitoring.map((a) => a.id)).toEqual(['watching']);
    expect(s.paused.map((a) => a.id)).toEqual(['p']);
  });
  it('treats a triggered alert with no date as old rather than alarming', () => {
    expect(isRecentlyTriggered({ status: 'triggered', triggeredAt: null }, NOW)).toBe(false);
  });
});

describe('alertTitle / alertFacts', () => {
  it('puts the condition in the title', () => {
    expect(alertTitle(alert({}))).toBe('TCS: Stop-loss below ₹2,300.00');
    expect(alertTitle(alert({ params: { direction: 'above', threshold: 3500 } }))).toBe('TCS: Price target above ₹3,500.00');
  });
  it('shows what a triggered alert hit and when', () => {
    const f = alertFacts(alert({ status: 'triggered', triggeredAt: new Date('2026-09-07T05:00:00Z'), lastObservedValue: 2282.6 }));
    expect(f).toEqual([
      { label: 'Hit at', value: '₹2,282.60' },
      { label: 'Triggered', value: '07 Sep 2026' },
    ]);
  });
  it('shows the last value and last check for a watched alert, and says "not yet" before the first check', () => {
    expect(alertFacts(alert({}))).toEqual([{ label: 'Last checked', value: 'not yet' }]);
    expect(alertFacts(alert({ lastObservedValue: 0 }))[0]).toEqual({ label: 'Last value', value: '₹0.00' });
  });
});

describe('guardrailBanner', () => {
  it('states the defaults when on and the consequence when off', () => {
    expect(guardrailBanner(true)).toMatchObject({ on: true, text: expect.stringContaining('10% trailing stop') });
    expect(guardrailBanner(false)).toMatchObject({ on: false, text: expect.stringMatching(/off/i) });
  });
});
