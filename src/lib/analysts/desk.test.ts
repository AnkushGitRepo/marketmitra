import { describe, expect, it } from 'vitest';
import { attentionReason, canAnalyzeNow, deskHeadline, isStalled, menuActions, primaryAction, stalledCount, tomorrowCount, filterAnalysts, filterCounts, queueLabel, queueState, summarizeDesk, type RosterAnalyst } from './desk';
import type { JournalEntry } from './types';

const NOW = new Date('2026-11-11T12:00:00Z');
const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({ id: 'e', symbol: 'X', ts: '2026-11-11T06:00:00Z', kind: 'price', title: 'Fell 5%', body: null, impact: null, alert: 'high', ...over });
const analyst = (symbol: string, over: Partial<RosterAnalyst> = {}): RosterAnalyst => ({
  symbol, source: 'holding', status: 'active', statusNote: null, hasDossier: true, summary: null, createdAt: '2026-11-01T00:00:00Z', lastCheckedAt: null, latest: null, eventCount: 0, quote: null, ...over,
});

describe('attentionReason', () => {
  it('flags a medium or high alert in the last 48 hours', () => {
    expect(attentionReason(analyst('A', { latest: entry({ alert: 'high' }) }), NOW)).toBe('Fell 5%');
    expect(attentionReason(analyst('A', { latest: entry({ alert: 'medium' }) }), NOW)).toBe('Fell 5%');
  });
  it('ignores a low alert and an old alert', () => {
    expect(attentionReason(analyst('A', { latest: entry({ alert: 'low' }) }), NOW)).toBeNull();
    expect(attentionReason(analyst('A', { latest: entry({ ts: '2026-11-08T12:00:00Z' }) }), NOW)).toBeNull();
  });
  it('flags an analyst in error, with its own note', () => {
    expect(attentionReason(analyst('A', { status: 'error', statusNote: 'Resume it.' }), NOW)).toBe('Resume it.');
    expect(attentionReason(analyst('A', { status: 'error' }), NOW)).toMatch(/error/i);
  });
});

describe('queueState', () => {
  const pending = (s: string, createdAt: string, statusNote: string | null = null) => analyst(s, { status: 'initializing', hasDossier: false, createdAt, statusNote });
  const usage = { used: 3, cap: 20 };
  it('counts only analysts created earlier that are really waiting their turn', () => {
    const all = [pending('A', '2026-11-01T00:00:00Z'), pending('B', '2026-11-02T00:00:00Z'), pending('K', '2026-11-01T12:00:00Z', 'Waiting for an AI key.'), pending('C', '2026-11-03T00:00:00Z')];
    expect(queueState(all[0], all, usage)).toEqual({ kind: 'queued', ahead: 0 });
    expect(queueState(all[3], all, usage)).toEqual({ kind: 'queued', ahead: 2 });
  });
  it('gives analysts created in the same instant distinct places in the queue', () => {
    const all = [pending('A', '2026-11-01T00:00:00Z'), pending('B', '2026-11-01T00:00:00Z'), pending('C', '2026-11-01T00:00:00Z')];
    expect(all.map((a) => queueState(a, all, usage))).toEqual([{ kind: 'queued', ahead: 0 }, { kind: 'queued', ahead: 1 }, { kind: 'queued', ahead: 2 }]);
  });
  it('says so when the key is missing or the daily cap is spent, and says nothing for built analysts', () => {
    const all = [pending('K', '2026-11-01T00:00:00Z', 'Waiting for an AI key. Add one in Settings.'), pending('B', '2026-11-02T00:00:00Z'), analyst('D')];
    expect(queueState(all[0], all, usage)).toEqual({ kind: 'needs_key' });
    expect(queueState(all[1], all, { used: 20, cap: 20 })).toEqual({ kind: 'cap_reached' });
    expect(queueState(all[2], all, usage)).toBeNull();
  });
  it('moves analysts behind the day\'s remaining AI budget to "tomorrow" instead of a false queue', () => {
    const all = ['A', 'B', 'C', 'D', 'E'].map((s, i) => pending(s, `2026-11-0${i + 1}T00:00:00Z`));
    const usage2 = { used: 18, cap: 20 };
    expect(all.map((a) => queueState(a, all, usage2)?.kind)).toEqual(['queued', 'queued', 'tomorrow', 'tomorrow', 'tomorrow']);
    expect(tomorrowCount(all, usage2)).toBe(3);
    expect(tomorrowCount(all, { used: 20, cap: 20 })).toBe(5);
    expect(tomorrowCount(all, { used: 0, cap: 20 })).toBe(0);
  });
  it('lets the user build a waiting or stalled dossier now, but not a built, paused or keyless one', () => {
    expect(canAnalyzeNow(pending('A', '2026-11-01T00:00:00Z'))).toBe(true);
    expect(canAnalyzeNow(analyst('B', { status: 'error', hasDossier: false, statusNote: 'Failed.' }))).toBe(true);
    expect(canAnalyzeNow(analyst('C'))).toBe(false);
    expect(canAnalyzeNow(analyst('D', { status: 'paused', hasDossier: false }))).toBe(false);
    expect(canAnalyzeNow(pending('E', '2026-11-01T00:00:00Z', 'Waiting for an AI key.'))).toBe(false);
    expect(isStalled(analyst('F', { status: 'error', hasDossier: false }))).toBe(true);
    expect(isStalled(analyst('G', { status: 'error', hasDossier: true }))).toBe(false);
  });
  it('labels each state in plain words', () => {
    expect(queueLabel({ kind: 'queued', ahead: 0 })).toBe('Queued, next up');
    expect(queueLabel({ kind: 'queued', ahead: 3 })).toBe('Queued, 3 ahead');
    expect(queueLabel({ kind: 'needs_key' })).toBe('Waiting for an AI key');
    expect(queueLabel({ kind: 'cap_reached' })).toMatch(/cap/i);
    expect(queueLabel({ kind: 'tomorrow' })).toBe('Scheduled for tomorrow (daily AI budget)');
    expect(queueLabel(null)).toBeNull();
  });
});

describe('filters and summary', () => {
  const list = [
    analyst('HOT', { latest: entry() }),
    analyst('CALM'),
    analyst('NEW', { status: 'initializing', hasDossier: false }),
    analyst('OFF', { status: 'paused' }),
    analyst('BAD', { status: 'error', statusNote: 'Failed.' }),
  ];
  it('keeps the filters disjoint where it matters: attention analysts are not also "vigilant"', () => {
    expect(filterAnalysts(list, 'attention', NOW).map((a) => a.symbol)).toEqual(['HOT', 'BAD']);
    expect(filterAnalysts(list, 'vigilant', NOW).map((a) => a.symbol)).toEqual(['CALM']);
    expect(filterAnalysts(list, 'waiting', NOW).map((a) => a.symbol)).toEqual(['NEW']);
    expect(filterAnalysts(list, 'all', NOW)).toHaveLength(5);
    expect(filterCounts(list, NOW)).toEqual({ all: 5, attention: 2, vigilant: 1, waiting: 1 });
  });
  it('summarises the desk and names the most recent note', () => {
    const s = summarizeDesk([...list, analyst('LATE', { latest: entry({ title: 'Newest', ts: '2026-11-11T09:00:00Z', alert: 'low' }) })], NOW);
    expect(s).toMatchObject({ total: 6, vigilant: 2, waiting: 1, paused: 1 });
    expect(s.attention.map((a) => a.symbol)).toEqual(['HOT', 'BAD']);
    expect(s.latest).toEqual({ symbol: 'LATE', title: 'Newest', ts: '2026-11-11T09:00:00Z' });
  });
  it('writes one honest headline, including the empty desk', () => {
    expect(deskHeadline(summarizeDesk(list, NOW))).toBe('5 analysts: 1 vigilant, 2 need attention, 1 building, 1 paused.');
    expect(deskHeadline(summarizeDesk([analyst('A'), analyst('B', { latest: entry() })], NOW))).toBe('2 analysts: 1 vigilant, 1 needs attention.');
    expect(deskHeadline(summarizeDesk([], NOW))).toBe('No analysts yet.');
  });
});

describe('card actions (#149)', () => {
  const stalled = analyst('S', { status: 'error', hasDossier: false, statusNote: 'The analyst hit an unexpected error.' });
  it('leads with one primary action by state', () => {
    expect(primaryAction(analyst('A')).kind).toBe('dossier');
    expect(primaryAction(analyst('B', { status: 'error', hasDossier: true })).kind).toBe('dossier');
    expect(primaryAction(stalled)).toEqual({ kind: 'retry', label: 'Retry' });
    expect(primaryAction(analyst('C', { status: 'initializing', hasDossier: false })).kind).toBe('analyze');
    expect(primaryAction(analyst('D', { status: 'initializing', hasDossier: false, statusNote: 'Waiting for an AI key. Add one in Settings.' })).kind).toBe('key');
    expect(primaryAction(analyst('E', { status: 'paused', hasDossier: false })).kind).toBe('resume');
  });
  it('keeps management actions in the menu, with no Resume next to a stalled analyst\'s Retry', () => {
    expect(menuActions(analyst('A')).map((m) => m.id)).toEqual(['pause']);
    expect(menuActions(analyst('B', { status: 'paused' })).map((m) => m.id)).toEqual(['resume']);
    expect(menuActions(analyst('C', { status: 'error', hasDossier: true })).map((m) => m.id)).toEqual(['resume']);
    expect(menuActions(stalled)).toEqual([]);
    expect(menuActions(analyst('W', { source: 'watcher' }))).toEqual([{ id: 'pause', label: 'Pause' }, { id: 'remove', label: 'Remove watcher', danger: true }]);
  });
  it('counts stalled analysts and describes them in plain words, not raw error text', () => {
    const list = [analyst('A'), stalled, analyst('T', { status: 'error', hasDossier: false })];
    expect(stalledCount(list)).toBe(2);
    expect(summarizeDesk(list, NOW).stalled).toBe(2);
    expect(attentionReason(stalled, NOW)).toBe('Dossier stalled. Retry it from its card.');
  });
});
