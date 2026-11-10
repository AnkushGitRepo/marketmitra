import { describe, expect, it } from 'vitest';
import {
  filterIpos,
  ipoPhase,
  ipoQueryString,
  istToday,
  paginate,
  parseIpoQuery,
  phaseCounts,
  typeCounts,
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
  ipo({ slug: 'listed-mb', status: 'listed' }),
  ipo({ slug: 'open-sme', status: 'open', category: 'sme' }),
  ipo({ slug: 'closed-waiting', status: 'closed', allotment_date: '2026-11-12' }),
  ipo({ slug: 'allotted-sme', status: 'closed', category: 'sme', allotment_date: '2026-11-09' }),
  ipo({ slug: 'upcoming-mb', status: 'upcoming' }),
  ipo({ slug: 'open-mb', status: 'open' }),
  ipo({ slug: 'closed-no-date', status: 'closed' }),
];

describe('ipoPhase', () => {
  it('derives "allotted" from a passed allotment date on a closed issue', () => {
    expect(ipoPhase({ status: 'closed', allotment_date: '2026-11-09' }, TODAY)).toBe('allotted');
    expect(ipoPhase({ status: 'closed', allotment_date: TODAY }, TODAY)).toBe('allotted');
  });
  it('keeps closed while allotment is still ahead or unknown', () => {
    expect(ipoPhase({ status: 'closed', allotment_date: '2026-11-12' }, TODAY)).toBe('closed');
    expect(ipoPhase({ status: 'closed', allotment_date: null }, TODAY)).toBe('closed');
  });
  it('passes other statuses through, whatever the allotment date', () => {
    expect(ipoPhase({ status: 'open', allotment_date: '2026-01-01' }, TODAY)).toBe('open');
    expect(ipoPhase({ status: 'listed', allotment_date: '2026-01-01' }, TODAY)).toBe('listed');
    expect(ipoPhase({ status: 'upcoming', allotment_date: null }, TODAY)).toBe('upcoming');
  });
});

describe('filterIpos', () => {
  const slugs = (f: Parameters<typeof filterIpos>[1]) => filterIpos(sample, f, TODAY).map((i) => i.slug);

  it('orders all by phase, keeping source order within a phase', () => {
    expect(slugs({ phase: 'all', type: 'all' })).toEqual([
      'open-sme', 'open-mb', 'upcoming-mb', 'closed-waiting', 'closed-no-date', 'allotted-sme', 'listed-mb',
    ]);
  });
  it('filters by phase', () => {
    expect(slugs({ phase: 'open', type: 'all' })).toEqual(['open-sme', 'open-mb']);
    expect(slugs({ phase: 'allotted', type: 'all' })).toEqual(['allotted-sme']);
    expect(slugs({ phase: 'closed', type: 'all' })).toEqual(['closed-waiting', 'closed-no-date']);
  });
  it('filters by type', () => {
    expect(slugs({ phase: 'all', type: 'sme' })).toEqual(['open-sme', 'allotted-sme']);
  });
  it('combines phase and type', () => {
    expect(slugs({ phase: 'open', type: 'sme' })).toEqual(['open-sme']);
    expect(slugs({ phase: 'listed', type: 'sme' })).toEqual([]);
  });
  it('does not mutate its input', () => {
    const before = sample.map((i) => i.slug);
    filterIpos(sample, { phase: 'all', type: 'all' }, TODAY);
    expect(sample.map((i) => i.slug)).toEqual(before);
  });
});

describe('counts', () => {
  it('phase counts respect the type filter and add up', () => {
    const all = phaseCounts(sample, 'all', TODAY);
    expect(all).toEqual({ all: 7, open: 2, upcoming: 1, closed: 2, allotted: 1, listed: 1 });
    const sme = phaseCounts(sample, 'sme', TODAY);
    expect(sme).toEqual({ all: 2, open: 1, upcoming: 0, closed: 0, allotted: 1, listed: 0 });
  });
  it('type counts respect the phase filter', () => {
    expect(typeCounts(sample, 'all', TODAY)).toEqual({ all: 7, mainboard: 5, sme: 2 });
    expect(typeCounts(sample, 'open', TODAY)).toEqual({ all: 2, mainboard: 1, sme: 1 });
  });
  it('count what filterIpos returns', () => {
    for (const phase of ['open', 'closed', 'allotted'] as const) {
      expect(filterIpos(sample, { phase, type: 'all' }, TODAY)).toHaveLength(phaseCounts(sample, 'all', TODAY)[phase]);
    }
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
  it('defaults when empty', () => {
    expect(read('')).toEqual({ phase: 'all', type: 'all', pageSize: 10, page: 0 });
  });
  it('reads filters, and treats the page as 1-based', () => {
    expect(read('status=allotted&type=sme&size=20&page=3')).toEqual({ phase: 'allotted', type: 'sme', pageSize: 20, page: 2 });
  });
  it('ignores junk', () => {
    expect(read('status=pending&type=bond&size=7&page=-2')).toEqual({ phase: 'all', type: 'all', pageSize: 10, page: 0 });
    expect(read('page=abc')).toMatchObject({ page: 0 });
  });
  it('round-trips, omitting defaults', () => {
    expect(ipoQueryString({ phase: 'all', type: 'all', pageSize: 10, page: 0 })).toBe('');
    const q = { phase: 'open', type: 'sme', pageSize: 20, page: 2 } as const;
    expect(read(ipoQueryString(q))).toEqual(q);
  });
});

describe('istToday', () => {
  it('uses the Indian date, not UTC', () => {
    // 20:00 UTC on the 9th is already 01:30 on the 10th in India.
    expect(istToday(new Date('2026-11-09T20:00:00Z'))).toBe('2026-11-10');
    expect(istToday(new Date('2026-11-10T10:00:00Z'))).toBe('2026-11-10');
  });
});
