import { describe, expect, it } from 'vitest';
import type { ChapterId } from './chapters';
import { activeNav, chapterAtLine, navItems } from './nav';

const ALL: ChapterId[] = ['overview', 'financials', 'peers', 'sector', 'regulatory', 'legal', 'management', 'valuation', 'risks'];

describe('navItems', () => {
  it('has one link per label in reading order, with regulatory and legal sharing one', () => {
    const items = navItems(ALL);
    expect(items.map((i) => i.label)).toEqual(['Overview', 'Financials', 'Peers', 'Sector', 'Regulatory & legal', 'Management', 'Valuation', 'Risks']);
    expect(items.find((i) => i.label === 'Regulatory & legal')).toMatchObject({ target: 'regulatory', ids: ['regulatory', 'legal'] });
  });
  it('lists only the chapters that are on the page, whatever order they arrived in', () => {
    expect(navItems(['risks', 'overview']).map((i) => i.label)).toEqual(['Overview', 'Risks']);
    expect(navItems([])).toEqual([]);
  });
  it('points a shared link at the chapter that exists when only one of the two has arrived', () => {
    expect(navItems(['legal'])[0]).toMatchObject({ label: 'Regulatory & legal', target: 'legal', ids: ['legal'] });
  });
});

describe('chapterAtLine', () => {
  const at = (...tops: number[]) => ALL.slice(0, tops.length).map((id, i) => ({ id, top: tops[i] }));
  it('is the last chapter whose top has reached the line', () => {
    expect(chapterAtLine(at(-900, -300, 120, 700), 140)).toBe('peers');
    expect(chapterAtLine(at(-900, -300, 120, 700), 100)).toBe('financials');
  });
  it('is the first chapter before any has reached the line, and null with none', () => {
    expect(chapterAtLine(at(400, 900), 140)).toBe('overview');
    expect(chapterAtLine([], 140)).toBeNull();
  });
  it('is the last chapter once the whole report is scrolled past', () => {
    expect(chapterAtLine(at(-2000, -1500, -900), 140)).toBe('peers');
  });
});

describe('activeNav', () => {
  const items = navItems(ALL);
  it('highlights the link that covers the chapter being read, including the second of a shared pair', () => {
    expect(activeNav(items, 'legal')).toBe('Regulatory & legal');
    expect(activeNav(items, 'valuation')).toBe('Valuation');
  });
  it('highlights nothing with no chapter, or one that has no link', () => {
    expect(activeNav(items, null)).toBeNull();
    expect(activeNav(navItems(['overview']), 'risks')).toBeNull();
  });
});

describe('navItems for a sector report', () => {
  it('gives the six links of the sector jump bar, pairing chapters that share a label', () => {
    const all = ['sx_overview', 'sx_scorecard', 'sx_leaders', 'sx_unlisted', 'sx_global', 'sx_outlook', 'sx_policy', 'sx_risks', 'sx_checklist'] as const;
    expect(navItems(all).map((i) => i.label)).toEqual(['Overview', 'Indian leaders', 'Unlisted & global', 'Future & policy', 'Legal & risks', 'Investor checklist']);
    expect(navItems(all)[0].ids).toEqual(['sx_overview', 'sx_scorecard']);
  });
});
