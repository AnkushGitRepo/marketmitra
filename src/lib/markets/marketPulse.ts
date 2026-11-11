/** Pure market-pulse maths and prompt building for the Markets page: no clock, network or storage. */

/**
 * NIFTY 50 constituents (NSE symbols). Hand-maintained, so it can lag an index rebalance; breadth is therefore labelled
 * "NIFTY 50 breadth" with the count of names that reported, never presented as the whole exchange.
 */
export const NIFTY50_SYMBOLS: readonly string[] = [
  'ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK', 'BAJAJ-AUTO', 'BAJFINANCE', 'BAJAJFINSV', 'BEL',
  'BHARTIARTL', 'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'ETERNAL', 'GRASIM', 'HCLTECH', 'HDFCBANK', 'HDFCLIFE',
  'HINDALCO', 'HINDUNILVR', 'ICICIBANK', 'INDIGO', 'INFY', 'ITC', 'JIOFIN', 'JSWSTEEL', 'KOTAKBANK', 'LT', 'M&M',
  'MARUTI', 'MAXHEALTH', 'NESTLEIND', 'NTPC', 'ONGC', 'POWERGRID', 'RELIANCE', 'SBILIFE', 'SBIN', 'SHRIRAMFIN',
  'SUNPHARMA', 'TATACONSUM', 'TATASTEEL', 'TCS', 'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO', 'WIPRO',
];

/** NSE sectoral indices and their Yahoo Finance tickers (all verified to return live quotes). */
export const SECTOR_INDICES: readonly { readonly label: string; readonly ticker: string }[] = [
  { label: 'IT', ticker: '^CNXIT' },
  { label: 'Bank', ticker: '^NSEBANK' },
  { label: 'PSU Bank', ticker: '^CNXPSUBANK' },
  { label: 'Fin Services', ticker: '^CNXFIN' },
  { label: 'Auto', ticker: '^CNXAUTO' },
  { label: 'FMCG', ticker: '^CNXFMCG' },
  { label: 'Pharma', ticker: '^CNXPHARMA' },
  { label: 'Metal', ticker: '^CNXMETAL' },
  { label: 'Energy', ticker: '^CNXENERGY' },
  { label: 'Realty', ticker: '^CNXREALTY' },
  { label: 'Infra', ticker: '^CNXINFRA' },
  { label: 'Media', ticker: '^CNXMEDIA' },
];

/** Below this many priced constituents, a breadth reading would mislead, so none is reported. */
export const MIN_BREADTH_COVERAGE = 25;
const MIN_BAR_SCALE_PCT = 0.5;

export interface Breadth {
  readonly advances: number;
  readonly declines: number;
  readonly unchanged: number;
  readonly total: number;
  /** Advances as a share of those that reported, 0 to 100. */
  readonly advancePct: number;
  /** Advances per decline; null when nothing declined. */
  readonly ratio: number | null;
}

export interface SectorMove {
  readonly label: string;
  readonly changePct: number;
}

export function computeBreadth(changePcts: readonly number[]): Breadth | null {
  const valid = changePcts.filter((c) => Number.isFinite(c));
  if (valid.length < MIN_BREADTH_COVERAGE) return null;
  const advances = valid.filter((c) => c > 0).length;
  const declines = valid.filter((c) => c < 0).length;
  return {
    advances,
    declines,
    unchanged: valid.length - advances - declines,
    total: valid.length,
    advancePct: (advances / valid.length) * 100,
    ratio: declines === 0 ? null : advances / declines,
  };
}

export function rankSectors<T extends SectorMove>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.changePct - a.changePct);
}

/** The largest absolute move, floored so a flat day does not blow tiny moves up to full-width bars. */
export function sectorBarScale(rows: readonly SectorMove[]): number {
  return Math.max(MIN_BAR_SCALE_PCT, ...rows.map((r) => Math.abs(r.changePct)));
}

