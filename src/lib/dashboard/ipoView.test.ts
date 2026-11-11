import { describe, expect, it } from 'vitest';
import { daysBetween, fmtDay, gmpView, ipoBadge, issueSizeText, lotText, minInvestment, priceText, subscriptionView, timeline } from './ipoView';
import type { Ipo } from './iposApi';

const TODAY = '2026-11-10';
type BadgeInput = Pick<Ipo, 'status' | 'allotment_date' | 'open_date' | 'close_date'>;
const b = (over: Partial<BadgeInput>) => ipoBadge({ status: 'open', allotment_date: null, open_date: null, close_date: null, ...over }, TODAY);

describe('dates', () => {
  it('counts whole days, across month ends', () => {
    expect(daysBetween('2026-11-10', '2026-11-12')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-11-10', '2026-11-08')).toBe(-2);
  });
  it('formats a day without timezone drift, and a missing one as a dash', () => {
    expect(fmtDay('2026-09-05')).toBe('5 Sep');
    expect(fmtDay(null)).toBe('—');
  });
});

describe('ipoBadge', () => {
  it('open with time left is green', () => {
    expect(b({ open_date: '2026-11-08', close_date: '2026-11-14' })).toEqual({ label: 'Open today', tone: 'open' });
  });
  it('warns amber when it closes within two days, and today', () => {
    expect(b({ close_date: '2026-11-12' })).toEqual({ label: 'Closes in 2 days', tone: 'closing' });
    expect(b({ close_date: '2026-11-11' })).toEqual({ label: 'Closes tomorrow', tone: 'closing' });
    expect(b({ close_date: TODAY })).toEqual({ label: 'Closes today', tone: 'closing' });
  });
  it('does not claim "open" for a stale status past its close date or before its opening', () => {
    expect(b({ close_date: '2026-11-01' })).toEqual({ label: 'Closed', tone: 'closed' });
    expect(b({ open_date: '2026-11-13', close_date: '2026-11-17' })).toEqual({ label: 'Opens in 3 days', tone: 'upcoming' });
  });
  it('upcoming counts down', () => {
    expect(b({ status: 'upcoming', open_date: '2026-11-11' })).toEqual({ label: 'Opens tomorrow', tone: 'upcoming' });
    expect(b({ status: 'upcoming', open_date: '2026-11-25' })).toEqual({ label: 'Opens in 15 days', tone: 'upcoming' });
    expect(b({ status: 'upcoming', open_date: TODAY })).toEqual({ label: 'Opens today', tone: 'upcoming' });
    expect(b({ status: 'upcoming' })).toEqual({ label: 'Upcoming', tone: 'upcoming' });
  });
  it('closed, allotted and listed', () => {
    expect(b({ status: 'closed', allotment_date: '2026-11-12' })).toEqual({ label: 'Closed', tone: 'closed' });
    expect(b({ status: 'closed', allotment_date: '2026-11-09' })).toEqual({ label: 'Allotment done', tone: 'allotted' });
    expect(b({ status: 'listed' })).toEqual({ label: 'Listed', tone: 'listed' });
  });
});

describe('gmpView', () => {
  it('is green for a positive premium, strongest from 20%', () => {
    expect(gmpView({ gmp: 69, gmp_pct: 46 })).toEqual({ text: '+₹69 (+46.0%)', tone: 'hot' });
    expect(gmpView({ gmp: 13, gmp_pct: 9.38 })).toEqual({ text: '+₹13 (+9.4%)', tone: 'gain' });
  });
  it('is red when negative and neutral at zero', () => {
    expect(gmpView({ gmp: -5, gmp_pct: -3.2 })).toEqual({ text: '-₹5 (-3.2%)', tone: 'loss' });
    expect(gmpView({ gmp: 0, gmp_pct: 0 })).toEqual({ text: '₹0 (0.0%)', tone: 'flat' });
  });
  it('says awaiting data, never zero, when there is no figure', () => {
    expect(gmpView({ gmp: null, gmp_pct: 0 })).toEqual({ text: 'GMP: awaiting data', tone: 'none' });
  });
  it('drops the percentage when it is unknown and keeps decimals on small rupee values', () => {
    expect(gmpView({ gmp: 0.5, gmp_pct: null })).toEqual({ text: '+₹0.5', tone: 'gain' });
  });
});

describe('subscriptionView / lot / size', () => {
  it('marks oversubscribed vs under, and missing', () => {
    expect(subscriptionView({ subscription_times: 42.8 })).toEqual({ text: '42.8x', tone: 'over' });
    expect(subscriptionView({ subscription_times: 0.52 })).toEqual({ text: '0.52x', tone: 'under' });
    expect(subscriptionView({ subscription_times: null })).toEqual({ text: '—', tone: 'none' });
  });
  it('computes the minimum investment only when price and lot are both known', () => {
    expect(minInvestment({ price: 279, lot_size: 53 })).toBe(14787);
    expect(minInvestment({ price: null, lot_size: 53 })).toBeNull();
    expect(lotText({ price: 279, lot_size: 53 })).toBe('53 shares (₹14,787)');
    expect(lotText({ price: null, lot_size: 4000 })).toBe('4,000 shares');
    expect(lotText({ price: 10, lot_size: null })).toBe('—');
  });
  it('treats the source\'s zero placeholders as missing, never as a real price, lot or size', () => {
    expect(priceText({ price: 0 })).toBe('—');
    expect(priceText({ price: 279 })).toBe('₹279');
    expect(minInvestment({ price: 0, lot_size: 53 })).toBeNull();
    expect(lotText({ price: 0, lot_size: 53 })).toBe('53 shares');
    expect(lotText({ price: 100, lot_size: 0 })).toBe('—');
    expect(issueSizeText({ ipo_size_cr: 0 })).toBe('—');
  });
  it('formats issue size', () => {
    expect(issueSizeText({ ipo_size_cr: 570 })).toBe('₹570 Cr');
    expect(issueSizeText({ ipo_size_cr: 10.54 })).toBe('₹10.5 Cr');
    expect(issueSizeText({ ipo_size_cr: null })).toBe('—');
  });
});

describe('timeline', () => {
  const dates = { open_date: '2026-11-05', close_date: '2026-11-09', allotment_date: '2026-11-12', listing_date: '2026-11-16' };
  it('marks finished steps and the next one', () => {
    expect(timeline(dates, TODAY).map((m) => [m.id, m.state])).toEqual([['bidding', 'done'], ['allotment', 'next'], ['listing', 'later']]);
  });
  it('keeps bidding "next" while it is still running, and shows the range', () => {
    const live = timeline({ ...dates, close_date: '2026-11-12' }, TODAY);
    expect(live[0]).toMatchObject({ text: '5 Nov – 12 Nov', state: 'next' });
  });
  it('shows dashes for missing dates and never marks them done', () => {
    const t = timeline({ open_date: null, close_date: null, allotment_date: null, listing_date: null }, TODAY);
    expect(t.map((m) => m.text)).toEqual(['—', '—', '—']);
    expect(t.map((m) => m.state)).toEqual(['next', 'later', 'later']);
  });
});
