import { describe, expect, it } from 'vitest';
import { buildNavSections, isNavActive } from './navItems';

const labels = (advisorEnabled: boolean) =>
  buildNavSections(advisorEnabled).map((s) => ({ title: s.title, items: s.items.map((i) => i.label) }));

describe('buildNavSections', () => {
  it('groups the navigation into four ordered sections', () => {
    expect(labels(false)).toEqual([
      { title: 'Overview', items: ['Dashboard', 'Portfolio'] },
      { title: 'Markets', items: ['Markets', 'Screener', 'IPOs', 'Research', 'News'] },
      { title: 'AI & Tools', items: ['Mitra chat', 'Agents', 'Alerts', 'Notes'] },
      { title: 'Settings', items: ['Settings', 'API'] },
    ]);
  });

  it('adds Advisor to AI & Tools, after Agents, only when enabled', () => {
    expect(labels(true)[2].items).toEqual(['Mitra chat', 'Agents', 'Advisor', 'Alerts', 'Notes']);
    expect(labels(false).flatMap((s) => s.items)).not.toContain('Advisor');
  });

  it('pins only the Settings section to the bottom', () => {
    const pinned = buildNavSections(false).filter((s) => s.pinnedToBottom);
    expect(pinned.map((s) => s.title)).toEqual(['Settings']);
  });

  it('does not list the operator-only System page for anyone', () => {
    const hrefs = buildNavSections(true).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).not.toContain('/system');
    expect(hrefs).toContain('/settings');
  });

  it('no longer lists Mitra activity as a primary item', () => {
    const hrefs = buildNavSections(true).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).not.toContain('/mitra-activity');
  });

  it('has no duplicate hrefs', () => {
    const hrefs = buildNavSections(true).flatMap((s) => s.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe('isNavActive', () => {
  it('keeps Dashboard exact-match only', () => {
    expect(isNavActive('/dashboard', '/dashboard')).toBe(true);
    expect(isNavActive('/news', '/dashboard')).toBe(false);
  });

  it('treats stock detail as part of Markets', () => {
    expect(isNavActive('/stock/TCS', '/markets')).toBe(true);
  });

  it('matches whole path segments, so Mitra chat is not active on Mitra activity', () => {
    expect(isNavActive('/mitra', '/mitra')).toBe(true);
    expect(isNavActive('/mitra/anything', '/mitra')).toBe(true);
    expect(isNavActive('/mitra-activity', '/mitra')).toBe(false);
    expect(isNavActive('/dashboard/portfolio-extra', '/portfolio')).toBe(false);
  });

  it('treats Mitra activity as part of Agents', () => {
    expect(isNavActive('/mitra-activity', '/agents')).toBe(true);
  });
});
