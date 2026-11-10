/** Pure portfolio maths for the Portfolio page: no clock, network or storage, so it tests without mocks. */

export interface HoldingLike {
  readonly symbol: string;
  readonly name: string;
  readonly quantity: number;
  readonly avgPrice: number;
  readonly ltp: number | null;
  readonly sector: string | null;
  readonly dayChange: number | null;
}

export interface PortfolioTotals {
  readonly totalValue: number;
  readonly invested: number;
  readonly todayChange: number;
}

export interface SectorWeight {
  readonly name: string;
  readonly pct: number;
  readonly value: number;
}

export interface DonutSegment extends SectorWeight {
  /** Start, as a percentage of the full circle. */
  readonly offset: number;
  /** Arc length, as a percentage of the full circle. */
  readonly length: number;
}

export type HoldingFilter = 'all' | 'profit' | 'loss';

export type RiskSeverity = 'high' | 'medium' | 'low' | 'info';

export interface RiskCard {
  readonly id: 'concentration' | 'sector' | 'drivers';
  readonly title: string;
  readonly text: string;
  readonly severity: RiskSeverity;
}

const OTHER_SECTOR = 'Other';
const TOP_N_CONCENTRATION = 3;
const CONCENTRATION_HIGH_PCT = 50;
const CONCENTRATION_MEDIUM_PCT = 35;
const SECTOR_HIGH_PCT = 40;
const SECTOR_MEDIUM_PCT = 30;

const valueOf = (h: HoldingLike): number | null => (h.ltp === null ? null : h.quantity * h.ltp);
const cost = (h: HoldingLike): number => h.quantity * h.avgPrice;
const pl = (h: HoldingLike): number | null => {
  const v = valueOf(h);
  return v === null ? null : v - cost(h);
};
/** Return on cost, as a percentage; null when unpriced or there is no cost basis. */
const returnPct = (h: HoldingLike): number | null => {
  const p = pl(h);
  const c = cost(h);
  return p === null || c <= 0 ? null : (p / c) * 100;
};

const priced = (holdings: readonly HoldingLike[]) => holdings.filter((h) => h.ltp !== null);

export function portfolioTotals(holdings: readonly HoldingLike[]): PortfolioTotals {
  return {
    totalValue: priced(holdings).reduce((sum, h) => sum + (valueOf(h) ?? 0), 0),
    invested: holdings.reduce((sum, h) => sum + cost(h), 0),
    todayChange: priced(holdings).reduce((sum, h) => sum + h.quantity * (h.dayChange ?? 0), 0),
  };
}

/** Sector weights by current value, largest first. Sectors beyond `maxSlices` fold into one "Other" slice. */
export function sectorWeights(holdings: readonly HoldingLike[], maxSlices = 6): SectorWeight[] {
  const pricedHoldings = priced(holdings);
  const total = pricedHoldings.reduce((sum, h) => sum + (valueOf(h) ?? 0), 0);
  if (total <= 0) return [];

  const bySector = new Map<string, number>();
  for (const h of pricedHoldings) {
    const name = h.sector ?? OTHER_SECTOR;
    bySector.set(name, (bySector.get(name) ?? 0) + (valueOf(h) ?? 0));
  }
  const sorted = [...bySector.entries()]
    .map(([name, value]) => ({ name, value, pct: (value / total) * 100 }))
    .sort((a, b) => b.value - a.value);

  if (sorted.length <= maxSlices) return sorted;
  const head = sorted.slice(0, maxSlices);
  const tailValue = sorted.slice(maxSlices).reduce((sum, s) => sum + s.value, 0);
  return [...head, { name: OTHER_SECTOR, value: tailValue, pct: (tailValue / total) * 100 }];
}

/** Arc geometry for a donut drawn with `pathLength="100"`: each segment starts where the last one ended. */
export function donutSegments(weights: readonly SectorWeight[]): DonutSegment[] {
  let offset = 0;
  return weights.map((w) => {
    const segment = { ...w, offset, length: w.pct };
    offset += w.pct;
    return segment;
  });
}

export function concentration(holdings: readonly HoldingLike[]): {
  readonly top3Pct: number;
  readonly largest: { readonly symbol: string; readonly pct: number } | null;
} {
  const byValue = priced(holdings)
    .map((h) => ({ symbol: h.symbol, value: valueOf(h) ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const total = byValue.reduce((sum, h) => sum + h.value, 0);
  if (total <= 0) return { top3Pct: 0, largest: null };
  const top3 = byValue.slice(0, TOP_N_CONCENTRATION).reduce((sum, h) => sum + h.value, 0);
  return { top3Pct: (top3 / total) * 100, largest: { symbol: byValue[0].symbol, pct: (byValue[0].value / total) * 100 } };
}

/** "In profit" and "in loss" mean strictly positive / negative P&L; flat and unpriced holdings appear only under All. */
export function filterHoldings<T extends HoldingLike>(holdings: readonly T[], filter: HoldingFilter): T[] {
  if (filter === 'all') return [...holdings];
  return holdings.filter((h) => {
    const p = pl(h);
    return p !== null && (filter === 'profit' ? p > 0 : p < 0);
  });
}

export function filterCounts(holdings: readonly HoldingLike[]): Record<HoldingFilter, number> {
  return {
    all: holdings.length,
    profit: filterHoldings(holdings, 'profit').length,
    loss: filterHoldings(holdings, 'loss').length,
  };
}

const signedPct = (n: number): string => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
const label = (h: HoldingLike): string => `${h.symbol} (${signedPct(returnPct(h) ?? 0)})`;

function severityFor(pct: number, high: number, medium: number): RiskSeverity {
  if (pct >= high) return 'high';
  return pct >= medium ? 'medium' : 'low';
}

function driversText(gainers: readonly HoldingLike[], losers: readonly HoldingLike[]): string {
  const best = gainers.slice(0, 2).map(label);
  const worst = losers[0];
  if (best.length > 0 && worst) return `Strong gains in ${best.join(' and ')} are offsetting drawdowns in ${label(worst)}.`;
  if (best.length > 0) return `Gains in ${best.join(' and ')} lead returns; no holding is in loss.`;
  if (worst) return `Drawdowns in ${label(worst)} are weighing on returns; no holding is in profit.`;
  return 'No standout winners or losers: returns are evenly spread.';
}

/** Three scannable risk notes computed from the user's own numbers, so they work without an AI key. */
export function buildRiskCards(holdings: readonly HoldingLike[]): RiskCard[] {
  const pricedHoldings = priced(holdings);
  if (pricedHoldings.length === 0) return [];

  const { top3Pct } = concentration(holdings);
  const sectors = sectorWeights(holdings, Number.POSITIVE_INFINITY);
  const topSector = sectors[0];
  const tickersInTopSector = pricedHoldings.filter((h) => (h.sector ?? OTHER_SECTOR) === topSector.name).length;

  const ranked = pricedHoldings
    .map((h) => ({ h, r: returnPct(h) }))
    .filter((x): x is { h: HoldingLike; r: number } => x.r !== null);
  const gainers = ranked.filter((x) => x.r > 0).sort((a, b) => b.r - a.r).map((x) => x.h);
  const losers = ranked.filter((x) => x.r < 0).sort((a, b) => a.r - b.r).map((x) => x.h);

  return [
    {
      id: 'concentration',
      title: 'Concentration risk',
      text: `${top3Pct.toFixed(1)}% of portfolio value is concentrated in your top ${TOP_N_CONCENTRATION} holdings.`,
      severity: severityFor(top3Pct, CONCENTRATION_HIGH_PCT, CONCENTRATION_MEDIUM_PCT),
    },
    {
      id: 'sector',
      title: 'Sector skew',
      text: `${topSector.pct.toFixed(1)}% allocation in ${topSector.name} across ${tickersInTopSector} distinct ticker${tickersInTopSector === 1 ? '' : 's'}.`,
      severity: severityFor(topSector.pct, SECTOR_HIGH_PCT, SECTOR_MEDIUM_PCT),
    },
    { id: 'drivers', title: 'Return drivers', text: driversText(gainers, losers), severity: 'info' },
  ];
}

/** Keeps only stories that tag at least one symbol the user holds (case-insensitive). */
export function newsForHoldings<T extends { readonly symbols: readonly string[] }>(
  items: readonly T[],
  holdings: readonly HoldingLike[]
): T[] {
  const held = new Set(holdings.map((h) => h.symbol.toUpperCase()));
  return items.filter((n) => n.symbols.some((s) => held.has(s.toUpperCase())));
}
