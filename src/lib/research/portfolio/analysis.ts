// The portfolio report's arithmetic (#390): positions, what carried and what dragged the result, how deep each loss is, what the
// book is weighted towards, and a one-standard-deviation range for the next twelve months. Pure functions of the holdings and the
// stored figures; nothing here is written by a model, and a figure the data does not hold stays null.

import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import type { HoldingInput } from '../portfolioBlocks';

/** A holding with the data service's figures for it and its price volatility, when each could be found. */
export interface HoldingFacts extends HoldingInput {
  readonly fundamentals: ScreenerResultRow | null;
  /** Annualised standard deviation of daily returns over the last year, in percent. */
  readonly volatilityPct: number | null;
}

export interface Position extends HoldingFacts {
  readonly invested: number;
  readonly value: number | null;
  readonly pl: number | null;
  readonly plPct: number | null;
  /** Share of the portfolio's value, with a holding that has no live price counted at what was paid. */
  readonly weightPct: number;
}

export type Severity = 'CRITICAL' | 'MODERATE' | 'NORMAL';

export const CRITICAL_LOSS_PCT = -30;
export const MODERATE_LOSS_PCT = -15;
/** A position this large (or a holding this far below cost) is searched for news. */
export const OVERWEIGHT_PCT = 12;

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

export function toPositions(holdings: readonly HoldingFacts[]): Position[] {
  const base = holdings.map((h) => {
    const invested = h.avgPrice * h.quantity;
    const value = h.ltp === null ? null : h.ltp * h.quantity;
    const pl = value === null ? null : value - invested;
    return { ...h, invested, value, pl, plPct: pl === null || invested === 0 ? null : (pl / invested) * 100 };
  });
  const total = sum(base.map((p) => p.value ?? p.invested));
  return base.map((p) => ({ ...p, weightPct: total === 0 ? 0 : ((p.value ?? p.invested) / total) * 100 }));
}

export const totalValue = (positions: readonly Position[]): number => sum(positions.map((p) => p.value ?? p.invested));

/** How far below cost a holding is: null when it is at or above cost, or has no live price. */
export function severityOf(plPct: number | null): Severity | null {
  if (plPct === null || plPct >= 0) return null;
  if (plPct <= CRITICAL_LOSS_PCT) return 'CRITICAL';
  if (plPct <= MODERATE_LOSS_PCT) return 'MODERATE';
  return 'NORMAL';
}

export interface Attribution {
  readonly netPl: number;
  readonly winners: readonly Position[];
  readonly losers: readonly Position[];
  /** The two biggest gainers' profit as a percentage of the net profit; null unless the book is in profit overall. */
  readonly gainConcentrationPct: number | null;
  readonly topWinners: number;
}

export function attribution(positions: readonly Position[]): Attribution {
  const priced = positions.filter((p) => p.pl !== null);
  const winners = priced.filter((p) => (p.pl as number) > 0).sort((a, b) => (b.pl as number) - (a.pl as number));
  const losers = priced.filter((p) => (p.pl as number) < 0).sort((a, b) => (a.pl as number) - (b.pl as number));
  const netPl = sum(priced.map((p) => p.pl as number));
  const topWinners = Math.min(2, winners.length);
  const topPl = sum(winners.slice(0, topWinners).map((p) => p.pl as number));
  return { netPl, winners, losers, topWinners, gainConcentrationPct: netPl > 0 && topWinners > 0 ? (topPl / netPl) * 100 : null };
}

export interface Weighted {
  readonly value: number | null;
  /** Share of the portfolio's value the figure covers. */
  readonly coveragePct: number;
}

const MIN_COVERAGE_PCT = 50;

/** A value-weighted average of a ratio over the holdings that have it; null when they cover too little of the book. */
export function weightedAverage(positions: readonly Position[], pick: (p: Position) => number | null): Weighted {
  const have = positions.flatMap((p) => {
    const v = pick(p);
    return v === null ? [] : [{ v, w: p.weightPct }];
  });
  const coveragePct = sum(have.map((h) => h.w));
  return { value: coveragePct < MIN_COVERAGE_PCT ? null : sum(have.map((h) => h.v * h.w)) / coveragePct, coveragePct };
}

/** The portfolio's P/E as total value over total earnings (a harmonic mean), over holdings with positive earnings. */
export function weightedPe(positions: readonly Position[]): Weighted {
  const have = positions.flatMap((p) => (p.fundamentals?.pe != null && p.fundamentals.pe > 0 ? [{ pe: p.fundamentals.pe, w: p.weightPct }] : []));
  const coveragePct = sum(have.map((h) => h.w));
  return { value: coveragePct < MIN_COVERAGE_PCT ? null : coveragePct / sum(have.map((h) => h.w / h.pe)), coveragePct };
}

export const roceOf = (p: Position): number | null => p.fundamentals?.roce ?? null;
export const roeOf = (p: Position): number | null => p.fundamentals?.roe ?? null;
export const debtOf = (p: Position): number | null => p.fundamentals?.debt_to_equity ?? null;

/** The data holds a P/E for the company and it is zero or negative: it reported no positive earnings. */
export const isLossMaking = (p: Position): boolean => p.fundamentals !== null && p.fundamentals.pe !== null && p.fundamentals.pe <= 0;

export interface SectorShare {
  readonly sector: string;
  readonly weightPct: number;
}

export function sectorShares(positions: readonly Position[]): SectorShare[] {
  const totals = new Map<string, number>();
  for (const p of positions) totals.set(p.sector ?? 'Unclassified', (totals.get(p.sector ?? 'Unclassified') ?? 0) + p.weightPct);
  return [...totals].map(([sector, weightPct]) => ({ sector, weightPct })).sort((a, b) => b.weightPct - a.weightPct);
}

export type Factor = 'Rate and credit cycle' | 'Global and export demand' | 'Regulated utilities and infrastructure' | 'Domestic consumption' | 'Other or unclassified';

/** The economic driver a sector or industry name points to; a name-based reading, not a measured sensitivity. */
const FACTOR_RULES: readonly (readonly [Factor, RegExp])[] = [
  ['Rate and credit cycle', /bank|financ|nbfc|lending|insurance|credit|housing finance|asset management|capital markets/i],
  ['Global and export demand', /pharma|drug|health|biotech|software|information technology|\bit\b|it services|chemical|textile|diversified chemicals|auto components|electronics/i],
  ['Regulated utilities and infrastructure', /gas|power|utilit|infrastructure|construction|cement|building|oil|energy|telecom|rail|road|port|shipping|aerospace|defen[cs]e/i],
  ['Domestic consumption', /consumer|retail|food|beverage|fmcg|apparel|hotel|restaurant|media|entertainment|real estate|realty|automobile|two wheeler|jewel/i],
];

export function factorOf(p: Position): Factor {
  const text = [p.fundamentals?.industry, p.sector].filter(Boolean).join(' ');
  return FACTOR_RULES.find(([, re]) => re.test(text))?.[0] ?? 'Other or unclassified';
}

export function factorShares(positions: readonly Position[]): { factor: Factor; weightPct: number; symbols: string[] }[] {
  const out = new Map<Factor, { weightPct: number; symbols: string[] }>();
  for (const p of positions) {
    const f = factorOf(p);
    const cur = out.get(f) ?? { weightPct: 0, symbols: [] };
    out.set(f, { weightPct: cur.weightPct + p.weightPct, symbols: [...cur.symbols, p.symbol] });
  }
  return [...out].map(([factor, v]) => ({ factor, ...v })).sort((a, b) => b.weightPct - a.weightPct);
}

export interface RiskItem {
  readonly severity: Severity;
  readonly heading: string;
  readonly text: string;
}

const BIG_SECTOR_PCT = 50;
const HIGH_SECTOR_PCT = 35;
const TOP_TWO_PCT = 35;
const FEW_HOLDINGS = 5;
const LARGE_CAP_CR = 100_000;

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, MODERATE: 1, NORMAL: 2 };

/** The standing weaknesses the figures show, each with a severity, worst first. Rules, not model judgement. */
export function riskRegister(positions: readonly Position[]): RiskItem[] {
  const items: RiskItem[] = [];
  const shares = sectorShares(positions);
  const top = shares[0];
  if (top && top.weightPct >= HIGH_SECTOR_PCT) {
    items.push({
      severity: top.weightPct >= BIG_SECTOR_PCT ? 'CRITICAL' : 'MODERATE',
      heading: `Single-sector overhang: ${top.sector}`,
      text: `${top.weightPct.toFixed(1)}% of the portfolio's value sits in one sector, so a sector-wide setback reaches most of the book at once.`,
    });
  }
  const deep = positions.filter((p) => severityOf(p.plPct) === 'CRITICAL');
  if (deep.length > 0) {
    items.push({
      severity: 'CRITICAL',
      heading: `Deep unrealised losses in ${deep.length} holding${deep.length === 1 ? '' : 's'}`,
      text: `${deep.map((p) => `${p.symbol} (${(p.plPct as number).toFixed(1)}%)`).join(', ')} ${deep.length === 1 ? 'is' : 'are'} more than ${Math.abs(CRITICAL_LOSS_PCT)}% below cost.`,
    });
  }
  const bySize = [...positions].sort((a, b) => b.weightPct - a.weightPct);
  const topTwo = sum(bySize.slice(0, 2).map((p) => p.weightPct));
  if (positions.length >= 3 && topTwo >= TOP_TWO_PCT) {
    items.push({
      severity: topTwo >= 50 ? 'CRITICAL' : 'MODERATE',
      heading: 'Position sizing is uneven',
      text: `${bySize[0].symbol} and ${bySize[1].symbol} together are ${topTwo.toFixed(1)}% of the portfolio's value.`,
    });
  }
  if (positions.length < FEW_HOLDINGS) {
    items.push({ severity: 'MODERATE', heading: 'Few holdings', text: `The book has ${positions.length} holding${positions.length === 1 ? '' : 's'}, so one company's result moves the whole portfolio.` });
  }
  const known = positions.filter((p) => p.fundamentals?.market_cap != null);
  if (known.length > 0 && !known.some((p) => (p.fundamentals?.market_cap as number) >= LARGE_CAP_CR)) {
    items.push({ severity: 'NORMAL', heading: 'No large-cap anchor', text: `None of the holdings has a market cap above ₹${LARGE_CAP_CR.toLocaleString('en-IN')} crore, so there is no large, liquid core.` });
  }
  const loss = positions.filter(isLossMaking);
  if (loss.length > 0) {
    items.push({ severity: 'NORMAL', heading: `${loss.length} loss-making holding${loss.length === 1 ? '' : 's'}`, text: `${loss.map((p) => p.symbol).join(', ')} reported no positive earnings, so a P/E does not apply.` });
  }
  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export interface HealthScore {
  readonly score: number;
  readonly label: 'Healthy' | 'Moderate' | 'Stressed';
  /** What was taken off 100, so the number can be checked. */
  readonly deductions: readonly { readonly reason: string; readonly points: number }[];
}

/** 100 less a fixed number of points for each weakness the risk register finds. A transparent checklist score, not a model. */
const POINTS: Record<Severity, number> = { CRITICAL: 15, MODERATE: 8, NORMAL: 3 };

export function healthScore(positions: readonly Position[]): HealthScore {
  const deductions = riskRegister(positions).map((r) => ({ reason: r.heading, points: POINTS[r.severity] }));
  const deepLosses = positions.filter((p) => severityOf(p.plPct) === 'MODERATE').length;
  const extra = deepLosses > 0 ? [{ reason: `${deepLosses} holding${deepLosses === 1 ? '' : 's'} 15-30% below cost`, points: Math.min(deepLosses * 4, 12) }] : [];
  const all = [...deductions, ...extra];
  const score = Math.max(0, 100 - sum(all.map((d) => d.points)));
  return { score, label: score >= 75 ? 'Healthy' : score >= 50 ? 'Moderate' : 'Stressed', deductions: all };
}

export interface Scenario {
  readonly name: 'Bear' | 'Base' | 'Bull';
  readonly movePct: number;
  readonly value: number;
}

export interface ScenarioRange {
  /** The portfolio's one-year volatility: holdings' volatilities averaged by weight (an upper bound, as it assumes they move together). */
  readonly volatilityPct: number;
  readonly coveragePct: number;
  readonly scenarios: readonly [Scenario, Scenario, Scenario];
  /** Each holding's rupee move at one standard deviation, biggest first. */
  readonly byHolding: readonly { readonly symbol: string; readonly sector: string; readonly weightPct: number; readonly moveRs: number }[];
}

/**
 * A one-standard-deviation range around today's value: the bear case is one volatility down, the bull case one up, the base case
 * unchanged. It describes how far the book has tended to swing, not where it will go, and states no expected return.
 */
export function scenarioRange(positions: readonly Position[]): ScenarioRange | null {
  const vol = weightedAverage(positions, (p) => p.volatilityPct);
  if (vol.value === null) return null;
  const value = totalValue(positions);
  const at = (name: Scenario['name'], movePct: number): Scenario => ({ name, movePct, value: value * (1 + movePct / 100) });
  const byHolding = positions
    .flatMap((p) => (p.volatilityPct === null ? [] : [{ symbol: p.symbol, sector: p.sector ?? 'Unclassified', weightPct: p.weightPct, moveRs: (p.value ?? p.invested) * (p.volatilityPct / 100) }]))
    .sort((a, b) => b.moveRs - a.moveRs);
  return { volatilityPct: vol.value, coveragePct: vol.coveragePct, scenarios: [at('Bear', -vol.value), at('Base', 0), at('Bull', vol.value)], byHolding };
}

/** Annualised volatility, in percent, of a series of closing prices (oldest first); null with too few prices to say. */
export function annualisedVolatility(closes: readonly number[]): number | null {
  const MIN_CLOSES = 60;
  const valid = closes.filter((c) => Number.isFinite(c) && c > 0);
  if (valid.length < MIN_CLOSES) return null;
  const returns = valid.slice(1).map((c, i) => Math.log(c / valid[i]));
  const mean = sum(returns) / returns.length;
  const variance = sum(returns.map((r) => (r - mean) ** 2)) / (returns.length - 1);
  return Math.sqrt(variance * 252) * 100;
}

/** The holdings worth a news search: those well below cost, the large positions, and the biggest gainers (to check their valuation). Losers first. */
export function holdingsToSearch(positions: readonly Position[], limit = 8): Position[] {
  const gainers = attribution(positions).winners.slice(0, TOP_WINNERS);
  const picked = positions.filter((p) => (p.plPct !== null && p.plPct <= MODERATE_LOSS_PCT) || p.weightPct > OVERWEIGHT_PCT || gainers.includes(p));
  return picked.sort((a, b) => (a.plPct ?? 0) - (b.plPct ?? 0)).slice(0, limit);
}

/** How many of the biggest gainers get a valuation check. */
export const TOP_WINNERS = 3;
