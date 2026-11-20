// Mitra Fund X-Ray (#274): three plain findings about a fund set against the user's own
// portfolio, computed from numbers we hold. Pure, so it tests without a browser and the AI
// only ever words what is already here. Descriptive, never advice: no buy/avoid verdicts, and
// no claim about individual stocks, because a fund's own holdings are not loaded.

import type { Tone } from '@/lib/ai/briefSpecs';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import type { FundDetail, FundSummary } from './types';

/** The sector weight at which the portfolio risk card also starts to call a sector heavy. */
export const SECTOR_WATCH_PCT = 30;
/** Fewer peers with a figure than this and a median would mean little. */
const MIN_PEERS_FOR_MEDIAN = 3;
/** A fund this much dearer or more volatile than its peers' median is flagged. */
const WORSE_THAN_MEDIAN_RATIO = 1.2;
/** Only a fund this much cheaper than its peers' median is called out as positive, not one a hair below it. */
const CLEARLY_CHEAPER_RATIO = 0.9;
const MAX_HOLDINGS_NAMED = 4;

export const STOCK_OVERLAP_NOTE = "Stock-level overlap isn't available: this fund's own holdings are not loaded.";

/** Sector names as holdings carry them (company profile sectors) for each fund theme that points at sectors. */
const THEME_SECTORS: Readonly<Record<string, readonly string[]>> = {
  'Financial services': ['Financial Services'],
  Healthcare: ['Healthcare'],
  Technology: ['Technology'],
  'Energy and resources': ['Energy', 'Basic Materials'],
  Consumption: ['Consumer Defensive', 'Consumer Cyclical'],
  Infrastructure: ['Industrials', 'Utilities'],
  Defence: ['Industrials'],
  Housing: ['Real Estate'],
};

/** The sectors a fund theme invests in; empty when the theme is not tied to sectors (international, quant, ...). */
export function sectorsForTheme(peerGroup: string | null): readonly string[] {
  return (peerGroup && THEME_SECTORS[peerGroup]) || [];
}

export interface SectorExposure {
  /** Share of the priced portfolio, in percent. */
  readonly pct: number;
  /** Holdings in those sectors, largest first. */
  readonly symbols: readonly string[];
  /** Holdings left out of the weight because they have no live price. */
  readonly unpriced: number;
  /** Priced holdings whose company profile has no sector: counted as outside the sectors. */
  readonly unclassified: number;
}

const valueOf = (h: HoldingLike): number | null => (h.ltp === null ? null : h.quantity * h.ltp);

/**
 * Weight of the named sectors in the priced portfolio, or null when nothing is priced (no weight can be stated).
 * Sector names match whatever their case; holdings with no price or no sector are counted, not guessed at.
 */
export function sectorExposure(holdings: readonly HoldingLike[], sectors: readonly string[]): SectorExposure | null {
  const wanted = new Set(sectors.map((name) => name.toLowerCase()));
  const priced = holdings.flatMap((h) => {
    const value = valueOf(h);
    return value !== null && value > 0 ? [{ h, value }] : [];
  });
  const unpriced = holdings.length - priced.length;
  if (priced.length === 0) return null;
  // The weight is a share of everything priced; a holding whose sector is unknown counts as outside the sectors.
  const total = priced.reduce((sum, p) => sum + p.value, 0);
  const unclassified = priced.filter((p) => p.h.sector === null).length;
  const inSectors = priced
    .filter((p) => p.h.sector !== null && wanted.has(p.h.sector.toLowerCase()))
    .sort((a, b) => b.value - a.value);
  const value = inSectors.reduce((sum, p) => sum + p.value, 0);
  return { pct: (value / total) * 100, symbols: inSectors.map((p) => p.h.symbol), unpriced, unclassified };
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

const known = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);

/** Median of a figure across peers, or null when too few peers have it. */
function peerMedian(peers: readonly FundSummary[], read: (f: FundSummary) => number | null): number | null {
  const values = peers.map(read).filter(known);
  return values.length >= MIN_PEERS_FOR_MEDIAN ? median(values) : null;
}

export type XrayKey = 'role' | 'overlap' | 'cost';

export interface XrayItem {
  readonly key: XrayKey;
  readonly tone: Tone;
  readonly text: string;
}

export interface XrayFacts {
  readonly items: readonly XrayItem[];
  /** The fund's comparison group (a theme for sector funds). */
  readonly theme: string | null;
  readonly sectors: readonly string[];
  /** Portfolio weight in the fund's sectors; null when the fund points at no sector or nothing is priced. */
  readonly portfolioPct: number | null;
  readonly peerCount: number;
}

const pct = (n: number, digits = 1): string => `${n.toFixed(digits)}%`;
const joinNames = (names: readonly string[]): string => {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

function roleItem(fund: FundDetail, peers: readonly FundSummary[], label: string): XrayItem {
  const vol = fund.std_dev_3y;
  if (!known(vol)) {
    return { key: 'role', tone: 'neutral', text: `A ${label} fund. Its 3-year risk figures are not stored yet.` };
  }
  const peerVol = peerMedian(peers, (f) => f.std_dev_3y);
  const worst = known(fund.max_drawdown_3y) ? ` and a worst fall of ${pct(Math.abs(fund.max_drawdown_3y))}` : '';
  const versus = peerVol === null ? ' (too few peers with a figure to compare)' : ` against a peer median of ${pct(peerVol)}`;
  const heavy = peerVol !== null && vol > peerVol * WORSE_THAN_MEDIAN_RATIO;
  return {
    key: 'role',
    tone: heavy ? 'warning' : 'neutral',
    text: `A ${label} fund with 3-year volatility of ${pct(vol)}${versus}${worst}.`,
  };
}

function leftOut(exposure: Pick<SectorExposure, 'unpriced' | 'unclassified'>): string {
  const parts = [
    exposure.unpriced > 0 ? `${exposure.unpriced} without a live price is not counted` : '',
    exposure.unclassified > 0 ? `${exposure.unclassified} without a sector counts as outside` : '',
  ].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join('; ')})` : '';
}

function overlapItem(
  holdings: readonly HoldingLike[] | null,
  sectors: readonly string[],
  label: string,
): { item: XrayItem; pct: number | null } {
  const note = ` ${STOCK_OVERLAP_NOTE}`;
  const neutral = (text: string, pct: number | null = null) => ({ item: { key: 'overlap' as const, tone: 'neutral' as const, text }, pct });
  // A failed read, no holdings and no prices are three different situations; each says which it is.
  if (holdings === null) return neutral(`Your holdings could not be read just now, so portfolio fit is not shown.${note}`);
  if (holdings.length === 0) return neutral(`Add your holdings to see how this fund fits what you own.${note}`);
  const exposure = sectorExposure(holdings, sectors);
  if (exposure === null) return neutral(`None of your holdings has a live price right now, so portfolio fit cannot be worked out.${note}`);
  if (sectors.length === 0) {
    return neutral(`${label} funds are not tied to one sector, so there is no direct sector link to your holdings.${leftOut(exposure)}${note}`);
  }

  const names = joinNames(sectors);
  if (exposure.pct === 0) {
    return neutral(`None of your holdings are in ${names}, the sector(s) a ${label} fund invests in.${leftOut(exposure)}${note}`, 0);
  }
  const held = joinNames(exposure.symbols.slice(0, MAX_HOLDINGS_NAMED));
  const more = exposure.symbols.length > MAX_HOLDINGS_NAMED ? ' and others' : '';
  const heavy = exposure.pct >= SECTOR_WATCH_PCT;
  return {
    item: {
      key: 'overlap',
      // "Watch" is the same concentration flag the portfolio risk card uses, a fact about the weight and not about the fund.
      tone: heavy ? 'warning' : 'neutral',
      text: `${pct(exposure.pct)} of your priced holdings is in ${names} (${held}${more}), the sector(s) a ${label} fund invests in${heavy ? '; that is already a large share of the portfolio' : ''}.${leftOut(exposure)}${note}`,
    },
    pct: exposure.pct,
  };
}

function costItem(fund: FundDetail, peers: readonly FundSummary[]): XrayItem {
  const expense = fund.expense_ratio;
  const fall = known(fund.max_drawdown_3y) ? Math.abs(fund.max_drawdown_3y) : null;
  if (!known(expense) && fall === null) {
    return { key: 'cost', tone: 'neutral', text: 'Expense ratio and worst fall are not stored for this fund yet.' };
  }
  const peerExpense = peerMedian(peers, (f) => f.expense_ratio);
  const peerFall = peerMedian(peers, (f) => (known(f.max_drawdown_3y) ? Math.abs(f.max_drawdown_3y) : null));

  const parts: string[] = [];
  if (known(expense)) {
    parts.push(`Expense ratio ${expense.toFixed(2)}%${peerExpense === null ? '' : ` against a peer median of ${peerExpense.toFixed(2)}%`}`);
  }
  if (fall !== null) {
    parts.push(`worst 3-year fall ${pct(fall)}${peerFall === null ? '' : ` against a peer median of ${pct(peerFall)}`}`);
  }
  const comparable = (known(expense) && peerExpense !== null) || (fall !== null && peerFall !== null);
  const suffix = comparable ? '' : ' (too few peers with a figure to compare)';

  const dearer = known(expense) && peerExpense !== null && expense > peerExpense * WORSE_THAN_MEDIAN_RATIO;
  const deeper = fall !== null && peerFall !== null && fall > peerFall * WORSE_THAN_MEDIAN_RATIO;
  const cheaper = known(expense) && peerExpense !== null && expense < peerExpense * CLEARLY_CHEAPER_RATIO;
  const tone: Tone = dearer || deeper ? 'warning' : cheaper ? 'positive' : 'neutral';
  const text = parts.join('; ');
  return { key: 'cost', tone, text: `${text.charAt(0).toUpperCase()}${text.slice(1)}${suffix}.` };
}

/** The three findings for `fund`, against its peers and the user's holdings. */
/** `holdings` is null when they could not be read, which is not the same as having none. */
export function buildXray(fund: FundDetail, peers: readonly FundSummary[], holdings: readonly HoldingLike[] | null): XrayFacts {
  const theme = fund.peer_group;
  const label = theme ?? fund.sub_category ?? fund.category;
  const sectors = sectorsForTheme(theme);
  const overlap = overlapItem(holdings, sectors, label);
  return {
    items: [roleItem(fund, peers, label), overlap.item, costItem(fund, peers)],
    theme,
    sectors,
    portfolioPct: overlap.pct,
    peerCount: peers.length,
  };
}
