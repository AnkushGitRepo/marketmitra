import { UNITS, withGst, type MetalId } from './convert';
import type { EtfRow, MetalRate } from './rates';

export type EtfSortKey = 'symbol' | 'price' | 'change';
export type SortDir = 'asc' | 'desc';

/** The price as shown: with the stated GST added when the toggle is on. Null stays null. */
export function shownPrice(price: number | null, inclGst: boolean): number | null {
  if (price === null) return null;
  return inclGst ? withGst(price) : price;
}

/** ETFs ordered by the chosen column; rows without a value go last whichever way it sorts. Returns a new array. */
export function sortEtfs(rows: readonly EtfRow[], key: EtfSortKey, dir: SortDir): EtfRow[] {
  const value = (r: EtfRow): string | number | null => (key === 'symbol' ? r.symbol : key === 'price' ? r.price : r.changePct);
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * sign;
  });
}

const metalOf = (id: string): MetalId | null => (id.startsWith('gold') ? 'gold' : id.startsWith('silver') ? 'silver' : id.startsWith('platinum') ? 'platinum' : null);

/** What a weight of the metal is worth at the estimated price, in rupees. Null when the price is missing or the weight is not positive. */
export function valueOfWeight(rate: Pick<MetalRate, 'id' | 'priceInr'>, grams: number): number | null {
  const metal = metalOf(rate.id);
  if (!metal || rate.priceInr === null || !(grams > 0)) return null;
  return (rate.priceInr / UNITS[metal].grams) * grams;
}
