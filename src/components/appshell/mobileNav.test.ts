import { describe, expect, it } from 'vitest';
import { buildNavSections } from './navItems';
import { DISMISS_DISTANCE_PX, buildMoreSections, isMoreActive, shouldDismissSheet } from './mobileNav';

const labels = (adv: boolean) => buildMoreSections(adv).map((s) => ({ title: s.title, items: s.items.map((i) => i.label) }));

describe('buildMoreSections', () => {
  it('groups the remaining routes into three clusters', () => {
    expect(labels(false)).toEqual([
      { title: 'Discovery', items: ['Screener', 'IPOs', 'Research', 'News'] },
      { title: 'Tools & intelligence', items: ['Agents', 'Alerts', 'Notes'] },
      { title: 'System & preferences', items: ['Settings & API keys', 'System status'] },
    ]);
  });

  it('adds Advisor only when enabled', () => {
    expect(labels(true)[1].items).toEqual(['Agents', 'Advisor', 'Alerts', 'Notes']);
    expect(labels(false).flatMap((s) => s.items)).not.toContain('Advisor');
  });

  it('never lists the operator-only System page', () => {
    expect(buildMoreSections(true).flatMap((s) => s.items.map((i) => i.href))).not.toContain('/system');
  });

  it('with the 5 bottom slots, covers every desktop route exactly once', () => {
    const bottom = ['/dashboard', '/portfolio', '/mitra', '/markets'];
    const more = buildMoreSections(true).flatMap((s) => s.items.map((i) => i.href));
    const desktop = buildNavSections(true).flatMap((s) => s.items.map((i) => i.href)).filter((h) => h !== '/api-docs');
    for (const href of desktop) expect([...bottom, ...more], href).toContain(href);
    expect(new Set([...bottom, ...more]).size).toBe(bottom.length + more.length);
  });
});

describe('isMoreActive', () => {
  it('is active on pages that live in the sheet', () => {
    for (const p of ['/screener', '/ipos/abc', '/alerts', '/settings', '/status']) expect(isMoreActive(p, true), p).toBe(true);
    expect(isMoreActive('/mitra-activity', false)).toBe(true); // reads as part of Agents
  });

  it('is not active on the bar\'s own pages', () => {
    for (const p of ['/dashboard', '/portfolio', '/mitra', '/markets', '/stock/TCS']) expect(isMoreActive(p, true), p).toBe(false);
  });

  it('does not treat /advisor as More when Advisor is disabled', () => {
    expect(isMoreActive('/advisor', false)).toBe(false);
    expect(isMoreActive('/advisor', true)).toBe(true);
  });
});

describe('shouldDismissSheet', () => {
  it('closes on a long drag down', () => expect(shouldDismissSheet(DISMISS_DISTANCE_PX, 0)).toBe(true));

  it('closes on a short, fast flick', () => expect(shouldDismissSheet(40, 0.9)).toBe(true));

  it('stays open on a short, slow drag or a tiny quick twitch', () => {
    expect(shouldDismissSheet(40, 0.1)).toBe(false);
    expect(shouldDismissSheet(10, 2)).toBe(false);
  });

  it('never closes on an upward drag or no movement', () => {
    expect(shouldDismissSheet(-200, 5)).toBe(false);
    expect(shouldDismissSheet(0, 5)).toBe(false);
  });
});
