import { withGst } from './convert';
import type { EtfRow } from './rates';

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
