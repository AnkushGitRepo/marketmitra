// Allotment odds by investor category for an IPO (#285). Pure: it takes the subscription multiples and the lot, and returns estimates.
// Nothing here invents a figure: a category whose subscription is unknown is left out, and every value is an estimate from the
// subscription multiple, not a promise.
//
// SEBI's categories for a mainboard issue: retail (individuals bidding up to ₹2 lakh), small NII (sNII, above ₹2 lakh to ₹10 lakh) and
// big NII (bNII, above ₹10 lakh); the non-institutional part is split one third / two thirds between sNII and bNII.
//
// How the estimate works (a simplification, stated so it is not mistaken for more):
//   - Retail and sNII: when oversubscribed, shares go by a draw of lots, so an applicant's chance of getting one allotment is about
//     1 / subscription (the multiple counts shares bid, so applicants who bid for several lots make the real chance a little better).
//   - bNII: allotted proportionately, so the share of a bid that is allotted is about 1 / subscription. This is a share of the bid,
//     not a chance, so it is never ranked against the draw categories.
//   - A category that is not oversubscribed gets everything it bid for (1).

export type OddsCategory = 'retail' | 'snii' | 'bnii';

const RETAIL_LIMIT = 200_000;
const SNII_LIMIT = 1_000_000;

export interface CategorySubscription {
  retail: number | null;
  snii: number | null;
  bnii: number | null;
  qib: number | null;
}

export interface ApplicationSize {
  minLots: number;
  /** Null when the category has no upper limit. */
  maxLots: number | null;
  minInvestment: number;
}

export type ApplicationSizes = Record<OddsCategory, ApplicationSize>;

export interface CategoryOdds {
  /** `chance`: probability of one allotment (a draw). `share`: fraction of the bid allotted (proportionate). Both are 0 to 1. */
  kind: 'chance' | 'share';
  value: number;
  minLots: number;
  minInvestment: number;
}

export interface AllotmentOdds {
  retail: CategoryOdds | null;
  snii: CategoryOdds | null;
  bnii: CategoryOdds | null;
  /** The draw category with the best chance (retail on a tie); null when no draw category has a known subscription. */
  bestChance: 'retail' | 'snii' | null;
}

/** The smallest and largest application in each category, in lots, from the issue price and lot size. Null when either is missing. */
export function applicationSizes(ipo: { price: number | null; lotSize: number | null }): ApplicationSizes | null {
  const { price, lotSize } = ipo;
  if (price === null || lotSize === null || !(price > 0) || !(lotSize > 0)) return null;
  const lot = price * lotSize;
  const size = (minLots: number, maxLots: number | null): ApplicationSize => ({ minLots, maxLots, minInvestment: minLots * lot });
  const retailMax = Math.max(1, Math.floor(RETAIL_LIMIT / lot));
  const sniiMin = Math.floor(RETAIL_LIMIT / lot) + 1;
  const sniiMax = Math.floor(SNII_LIMIT / lot);
  return {
    retail: size(1, retailMax),
    snii: size(sniiMin, Math.max(sniiMin, sniiMax)),
    bnii: size(Math.max(sniiMin, sniiMax) + 1, null),
  };
}

const usable = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;
const oneOver = (n: number): number => Math.min(1, 1 / n);

export function allotmentOdds(sub: CategorySubscription, sizes: ApplicationSizes): AllotmentOdds {
  const make = (category: OddsCategory, subscription: number | null, kind: CategoryOdds['kind']): CategoryOdds | null =>
    usable(subscription) ? { kind, value: oneOver(subscription), minLots: sizes[category].minLots, minInvestment: sizes[category].minInvestment } : null;

  const retail = make('retail', sub.retail, 'chance');
  const snii = make('snii', sub.snii, 'chance');
  const bnii = make('bnii', sub.bnii, 'share');
  const bestChance = retail && snii ? (snii.value > retail.value ? 'snii' : 'retail') : retail ? 'retail' : snii ? 'snii' : null;
  return { retail, snii, bnii, bestChance };
}
