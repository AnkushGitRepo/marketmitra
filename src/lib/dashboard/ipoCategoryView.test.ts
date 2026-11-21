import { describe, expect, it } from 'vitest';
import { ipoCategoryView } from './ipoCategoryView';
import type { Ipo } from './iposApi';

const ipo = (over: Partial<Ipo> = {}): Ipo =>
  ({ price: 100, lot_size: 150, sub_qib: 0, sub_nii: 20, sub_snii: 13.23, sub_bnii: 23.39, sub_retail: 15.42, sub_as_of: '2026-11-20T12:26:00Z', ...over }) as Ipo;

describe('ipoCategoryView', () => {
  it('is null when no category figure is known, so the card shows nothing rather than a guess', () => {
    expect(ipoCategoryView(ipo({ sub_snii: null, sub_bnii: null, sub_retail: null }))).toBeNull();
    expect(ipoCategoryView({ price: 100, lot_size: 150 } as Ipo)).toBeNull();
  });

  it('lists retail, sNII and bNII with the multiple, the smallest application and the estimated odds', () => {
    const v = ipoCategoryView(ipo())!;
    expect(v.rows.map((r) => r.key)).toEqual(['retail', 'snii', 'bnii']);
    expect(v.rows[0]).toMatchObject({ label: 'Retail', subscribed: '15.42x', minApplication: '₹15,000 (1 lot)', odds: '≈ 1 in 15.4 (6%)' });
    expect(v.rows[1]).toMatchObject({ label: 'Small NII', subscribed: '13.23x', minApplication: '₹2,10,000 (14 lots)', odds: '≈ 1 in 13.2 (8%)' });
    expect(v.rows[2]).toMatchObject({ label: 'Big NII', subscribed: '23.39x', minApplication: '₹10,05,000 (67 lots)', odds: '≈ 4% of your bid' });
  });

  it('says full allotment for a category that is not oversubscribed', () => {
    const v = ipoCategoryView(ipo({ sub_retail: 0.6, sub_snii: 1, sub_bnii: 0.2 }))!;
    expect(v.rows.map((r) => r.odds)).toEqual(['Full allotment', 'Full allotment', 'Full allotment']);
  });

  it('shows a dash for a category with no figure and still lists the others', () => {
    const v = ipoCategoryView(ipo({ sub_snii: null, sub_bnii: null }))!;
    expect(v.rows.map((r) => [r.key, r.subscribed, r.odds])).toEqual([
      ['retail', '15.42x', '≈ 1 in 15.4 (6%)'],
      ['snii', '—', '—'],
      ['bnii', '—', '—'],
    ]);
  });

  it('shows QIB demand and names the draw category with the best chance', () => {
    const v = ipoCategoryView(ipo({ sub_qib: 12.68 }))!;
    expect(v.qib).toBe('12.68x');
    expect(v.bestChance).toBe('Small NII');
    expect(ipoCategoryView(ipo({ sub_qib: null }))!.qib).toBeNull();
  });

  it('has no best chance when only the proportional category is known', () => {
    expect(ipoCategoryView(ipo({ sub_retail: null, sub_snii: null }))!.bestChance).toBeNull();
  });

  it('shows application sizes as unknown when the price or lot is missing, but keeps the multiples and odds', () => {
    const v = ipoCategoryView(ipo({ lot_size: null }))!;
    expect(v.rows[0]).toMatchObject({ subscribed: '15.42x', minApplication: '—', odds: '≈ 1 in 15.4 (6%)' });
  });

  it('formats the as-of time in IST', () => {
    expect(ipoCategoryView(ipo())!.asOf).toMatch(/^20 Nov, 17:56$/);
    expect(ipoCategoryView(ipo({ sub_as_of: null }))!.asOf).toBeNull();
    expect(ipoCategoryView(ipo({ sub_as_of: 'garbage' }))!.asOf).toBeNull();
  });
});
