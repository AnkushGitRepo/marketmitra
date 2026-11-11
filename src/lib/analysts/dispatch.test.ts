import { describe, expect, it } from 'vitest';
import { buildDispatch, renderDispatchText, type DispatchAnalyst } from './dispatch';
import type { JournalEntry } from './types';

const NOW = new Date('2026-11-12T03:00:00Z');
const entry = (symbol: string, over: Partial<JournalEntry> = {}): JournalEntry => ({ id: `${symbol}${over.title ?? ''}`, symbol, ts: '2026-11-11T14:00:00Z', kind: 'news', title: 'Headline', body: null, impact: null, alert: 'low', ...over });
const analyst = (symbol: string, over: Partial<DispatchAnalyst> = {}): DispatchAnalyst => ({ symbol, status: 'active', summary: 'Low debt. Profit fell sharply.', ...over });

describe('buildDispatch', () => {
  it('splits priority (earnings, range, medium or high) from overnight developments, most urgent first', () => {
    const d = buildDispatch(
      [analyst('ACC'), analyst('PNB')],
      [entry('ACC', { kind: 'earnings', title: 'Results out', alert: 'low' }), entry('PNB', { title: 'Big drop', kind: 'price', alert: 'high' }), entry('PNB', { title: 'RBI notice', kind: 'news', alert: 'low' })],
      NOW
    )!;
    expect(d.priority.map((i) => i.title)).toEqual(['Big drop', 'Results out']);
    expect(d.developments.map((i) => i.title)).toEqual(['RBI notice']);
    expect(d.title).toBe('Morning brief: 2 items need a look');
    expect(d.day).toBe('2026-11-12');
  });
  it('is null with no active analysts, and null when nothing material happened (no empty emails)', () => {
    expect(buildDispatch([analyst('ACC', { status: 'paused' })], [entry('ACC', { alert: 'high' })], NOW)).toBeNull();
    expect(buildDispatch([analyst('ACC')], [], NOW)).toBeNull();
    expect(buildDispatch([analyst('ACC')], [entry('ACC', { kind: 'initiation', alert: 'high' })], NOW)).toBeNull();
  });
  it('only looks at the last 24 hours and ignores future or paused-analyst entries', () => {
    const d = buildDispatch([analyst('ACC'), analyst('OFF', { status: 'paused' })], [entry('ACC', { title: 'Old', ts: '2026-11-10T02:59:00Z' }), entry('ACC', { title: 'Fresh', ts: '2026-11-11T03:01:00Z' }), entry('OFF', { title: 'Paused one' })], NOW)!;
    expect(d.developments.map((i) => i.title)).toEqual(['Fresh']);
  });
  it('adds a one-line highlight per active analyst with a dossier, clipped to a sentence', () => {
    const d = buildDispatch([analyst('ACC'), analyst('NEW', { summary: null })], [entry('ACC')], NOW)!;
    expect(d.highlights).toEqual([{ symbol: 'ACC', text: 'Low debt.' }]);
  });
  it('caps each section so one noisy day stays readable', () => {
    const many = Array.from({ length: 20 }, (_, i) => entry('ACC', { title: `N${i}`, ts: `2026-11-11T1${i % 10}:00:00Z` }));
    expect(buildDispatch([analyst('ACC')], many, NOW)!.developments).toHaveLength(8);
  });
});

describe('renderDispatchText', () => {
  it('writes the sections that exist and the not-advice line', () => {
    const d = buildDispatch([analyst('ACC')], [entry('ACC', { kind: 'earnings', title: 'Results out' })], NOW)!;
    const t = renderDispatchText(d);
    expect(t).toContain('Priority\n- ACC: Results out');
    expect(t).not.toContain('Overnight developments');
    expect(t).toContain('Where each analyst stands\n- ACC: Low debt.');
    expect(t).toMatch(/From 1 analyst, built from public data\. Not investment advice\.$/);
  });
});
