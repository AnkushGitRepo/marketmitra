import { describe, expect, it } from 'vitest';
import {
  defaultGroup,
  filterIpos,
  groupCounts,
  groupOf,
  ipoPhase,
  ipoQueryString,
  istToday,
  paginate,
  parseIpoQuery,
  typeCounts,
  visibleGroups,
} from './ipoFilters';
import type { Ipo } from './iposApi';

const TODAY = '2026-11-10';

function ipo(over: Partial<Ipo> & { slug: string }): Ipo {
  return {
    name: over.slug, source_url: null, category: 'mainboard', status: 'upcoming', price: null, ipo_size_cr: null,
    lot_size: null, rating: null, subscription_times: null, anchor: null, gmp: null, gmp_pct: null, gmp_low: null,
    gmp_high: null, gmp_updated_at: null, open_date: null, close_date: null, allotment_date: null, listing_date: null,
    source_tier: 't', fetched_at: '2026-11-10T00:00:00Z', ...over,
  };
}

const sample: Ipo[] = [
  ipo({ slug: 'listed-old', status: 'listed', listing_date: '2026-10-01' }),
  ipo({ slug: 'open-late', status: 'open', category: 'sme', close_date: '2026-11-14' }),
  ipo({ slug: 'closed-waiting', status: 'closed', allotment_date: '2026-11-12', close_date: '2026-11-09' }),
  ipo({ slug: 'allotted-sme', status: 'closed', category: 'sme', allotment_date: '2026-11-09', close_date: '2026-11-05' }),
  ipo({ slug: 'upcoming-later', status: 'upcoming', open_date: '2026-11-20' }),
  ipo({ slug: 'upcoming-soon', status: 'upcoming', open_date: '2026-11-12' }),
  ipo({ slug: 'open-soon', status: 'open', close_date: '2026-11-11' }),
  ipo({ slug: 'listed-new', status: 'listed', listing_date: '2026-11-05' }),
];

describe('ipoPhase / groupOf', () => {
  it('derives "allotted" from a passed allotment date on a closed issue', () => {
    expect(ipoPhase({ status: 'closed', allotment_date: '2026-11-09' }, TODAY)).toBe('allotted');
    expect(ipoPhase({ status: 'closed', allotment_date: TODAY }, TODAY)).toBe('allotted');
  });
  it('keeps closed while allotment is still ahead or unknown', () => {
    expect(ipoPhase({ status: 'closed', allotment_date: '2026-11-12' }, TODAY)).toBe('closed');
    expect(ipoPhase({ status: 'closed', allotment_date: null }, TODAY)).toBe('closed');
  });
  it('treats an issue still marked open after its close date as closed (the source lagged)', () => {
    expect(ipoPhase({ status: 'open', allotment_date: '2026-11-12', close_date: '2026-11-09' }, TODAY)).toBe('closed');
    expect(ipoPhase({ status: 'open', allotment_date: '2026-11-09', close_date: '2026-11-05' }, TODAY)).toBe('allotted');
    expect(ipoPhase({ status: 'open', allotment_date: null, close_date: TODAY }, TODAY)).toBe('open');
  });
  it('treats an upcoming issue past its close date as closed, and one inside its bidding window as open', () => {
    expect(ipoPhase({ status: 'upcoming', open_date: '2026-11-01', close_date: '2026-11-05', allotment_date: null }, TODAY)).toBe('closed');
    expect(ipoPhase({ status: 'upcoming', open_date: '2026-11-09', close_date: '2026-11-12', allotment_date: null }, TODAY)).toBe('open');
    expect(ipoPhase({ status: 'upcoming', open_date: '2026-11-12', close_date: '2026-11-15', allotment_date: null }, TODAY)).toBe('upcoming');
    expect(ipoPhase({ status: 'upcoming', open_date: '2026-11-09', close_date: null, allotment_date: null }, TODAY)).toBe('upcoming');
  });
  it('passes other statuses through', () => {
    expect(ipoPhase({ status: 'open', allotment_date: '2026-01-01' }, TODAY)).toBe('open');
    expect(ipoPhase({ status: 'listed', allotment_date: null }, TODAY)).toBe('listed');
  });
  it('puts open and upcoming in Live, closed and allotted in Closed, listed in Listed', () => {
    expect(['open', 'upcoming', 'closed', 'allotted', 'listed'].map((p) => groupOf(p as never))).toEqual(['live', 'live', 'closed', 'closed', 'listed']);
  });
});

describe('filterIpos', () => {
  const slugs = (f: Parameters<typeof filterIpos>[1]) => filterIpos(sample, f, TODAY).map((i) => i.slug);

  it('Live: open issues first (closing soonest), then upcoming by opening date', () => {
    expect(slugs({ group: 'live', type: 'all' })).toEqual(['open-soon', 'open-late', 'upcoming-soon', 'upcoming-later']);
  });
  it('Closed: newest close first, covering closed and allotted', () => {
    expect(slugs({ group: 'closed', type: 'all' })).toEqual(['closed-waiting', 'allotted-sme']);
  });
  it('Listed: most recently listed first', () => {
    expect(slugs({ group: 'listed', type: 'all' })).toEqual(['listed-new', 'listed-old']);
  });
  it('combines with the type filter', () => {
    expect(slugs({ group: 'live', type: 'sme' })).toEqual(['open-late']);
    expect(slugs({ group: 'listed', type: 'sme' })).toEqual([]);
  });
  it('puts issues with a missing date last and keeps source order on ties, without mutating the input', () => {
    const list = [ipo({ slug: 'a', status: 'upcoming' }), ipo({ slug: 'b', status: 'upcoming', open_date: '2026-12-01' }), ipo({ slug: 'c', status: 'upcoming' })];
    const before = list.map((i) => i.slug);
    expect(filterIpos(list, { group: 'live', type: 'all' }, TODAY).map((i) => i.slug)).toEqual(['b', 'a', 'c']);
    expect(list.map((i) => i.slug)).toEqual(before);
  });
});

describe('counts and tabs', () => {
  it('group counts respect the type filter', () => {
    expect(groupCounts(sample, 'all', TODAY)).toEqual({ live: 4, closed: 2, listed: 2 });
    expect(groupCounts(sample, 'sme', TODAY)).toEqual({ live: 1, closed: 1, listed: 0 });
  });
  it('type counts respect the tab', () => {
    expect(typeCounts(sample, 'live', TODAY)).toEqual({ all: 4, mainboard: 3, sme: 1 });
    expect(typeCounts(sample, 'listed', TODAY)).toEqual({ all: 2, mainboard: 2, sme: 0 });
  });
  it('counts match what filterIpos returns', () => {
    for (const group of ['live', 'closed', 'listed'] as const) {
      expect(filterIpos(sample, { group, type: 'all' }, TODAY)).toHaveLength(groupCounts(sample, 'all', TODAY)[group]);
    }
  });
  it('hides empty tabs unless active, and opens on the first non-empty one', () => {
    expect(visibleGroups({ live: 0, closed: 0, listed: 14 }, 'listed')).toEqual(['listed']);
    expect(visibleGroups({ live: 0, closed: 0, listed: 14 }, 'live')).toEqual(['live', 'listed']);
    expect(defaultGroup({ live: 0, closed: 3, listed: 14 })).toBe('closed');
    expect(defaultGroup({ live: 2, closed: 0, listed: 14 })).toBe('live');
    expect(defaultGroup({ live: 0, closed: 0, listed: 0 })).toBe('live');
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  it('slices pages and reports the totals', () => {
    expect(paginate(items, 0, 10)).toMatchObject({ items: items.slice(0, 10), page: 0, pageCount: 3, total: 25 });
    expect(paginate(items, 2, 10).items).toEqual([20, 21, 22, 23, 24]);
  });
  it('clamps an out-of-range page instead of showing nothing', () => {
    expect(paginate(items, 99, 10).page).toBe(2);
    expect(paginate(items, -4, 10).page).toBe(0);
    expect(paginate(items, Number.NaN, 10).page).toBe(0);
  });
  it('handles an empty list', () => {
    expect(paginate([], 0, 10)).toEqual({ items: [], page: 0, pageCount: 1, total: 0 });
  });
});

describe('URL query', () => {
  const read = (qs: string) => parseIpoQuery(new URLSearchParams(qs));
  it('defaults when empty (group not chosen)', () => {
    expect(read('')).toEqual({ group: null, type: 'all', pageSize: 10, page: 0 });
  });
  it('reads the view, and treats the page as 1-based', () => {
    expect(read('group=closed&type=sme&size=20&page=3')).toEqual({ group: 'closed', type: 'sme', pageSize: 20, page: 2 });
  });
  it('maps old ?status= links onto the new tabs', () => {
    expect(read('status=open').group).toBe('live');
    expect(read('status=upcoming').group).toBe('live');
    expect(read('status=allotted').group).toBe('closed');
    expect(read('status=listed').group).toBe('listed');
    expect(read('status=all').group).toBeNull();
  });
  it('ignores junk', () => {
    expect(read('group=pending&type=bond&size=7&page=-2')).toEqual({ group: null, type: 'all', pageSize: 10, page: 0 });
    expect(read('page=abc')).toMatchObject({ page: 0 });
  });
  it('round-trips, omitting defaults', () => {
    expect(ipoQueryString({ group: null, type: 'all', pageSize: 10, page: 0 })).toBe('');
    const q = { group: 'live', type: 'sme', pageSize: 20, page: 2 } as const;
    expect(read(ipoQueryString(q))).toEqual(q);
  });
});

describe('istToday', () => {
  it('uses the Indian date, not UTC', () => {
    expect(istToday(new Date('2026-11-09T20:00:00Z'))).toBe('2026-11-10');
    expect(istToday(new Date('2026-11-10T10:00:00Z'))).toBe('2026-11-10');
  });
});
