// Grounding facts and prompts for the four structured Mitra briefs (#125, ADR 0057). Pure: the figures are computed here from data
// the pages already hold, so the model writes from numbers instead of inventing them.

import type { Alert } from '@/lib/alerts/types';
import type { Ipo } from '@/lib/dashboard/iposApi';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import type { Breadth, SectorMove } from '@/lib/markets/marketPulse';
import type { GroundingPassage } from '@/lib/rag/insightContext';

const NA = 'not available';
const inr = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const signedInr = (n: number) => `${n >= 0 ? '+' : '-'}${inr(n)}`;
const signedPct = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;

// ---------- Dashboard ----------

export interface HoldingFact {
  symbol: string;
  name: string;
  sector: string | null;
  quantity: number;
  avgPrice: number;
  ltp: number | null;
  /** Per-share move today, in rupees. */
  dayChange: number | null;
}

export interface AlertNear {
  symbol: string;
  direction: 'above' | 'below';
  threshold: number;
  ltp: number;
  distancePct: number;
}

export interface PortfolioFacts {
  totalCount: number;
  pricedCount: number;
  totalValue: number | null;
  dayChangeAmount: number | null;
  dayChangePct: number | null;
  topContributor: { symbol: string; amount: number } | null;
  topDetractor: { symbol: string; amount: number } | null;
  biggestHolding: { symbol: string; weightPct: number } | null;
  topSector: { sector: string; weightPct: number } | null;
  alertsNear: AlertNear[];
}

const NEAR_ALERT_PCT = 3;
const MAX_ALERTS_SHOWN = 3;

export function buildPortfolioFacts(holdings: readonly HoldingFact[], alerts: readonly Alert[]): PortfolioFacts {
  const priced = holdings.filter((x) => x.ltp !== null);
  const value = (x: HoldingFact) => x.quantity * (x.ltp as number);
  const totalValue = priced.length ? priced.reduce((s, x) => s + value(x), 0) : null;

  const moves = priced.filter((x) => x.dayChange !== null).map((x) => ({ symbol: x.symbol, amount: x.quantity * (x.dayChange as number) }));
  const dayChangeAmount = moves.length ? moves.reduce((s, m) => s + m.amount, 0) : null;
  const prior = totalValue !== null && dayChangeAmount !== null ? totalValue - dayChangeAmount : null;

  const byAmount = [...moves].sort((a, b) => b.amount - a.amount);
  const biggest = totalValue ? [...priced].sort((a, b) => value(b) - value(a))[0] : null;

  const sectorValue = new Map<string, number>();
  for (const x of priced) if (x.sector) sectorValue.set(x.sector, (sectorValue.get(x.sector) ?? 0) + value(x));
  const topSector = totalValue ? [...sectorValue].sort((a, b) => b[1] - a[1])[0] : undefined;

  const ltpBySymbol = new Map(priced.map((x) => [x.symbol, x.ltp as number]));
  const alertsNear: AlertNear[] = [];
  for (const a of alerts) {
    if (a.type !== 'price_threshold' || a.status !== 'active' || !a.symbol) continue;
    const ltp = ltpBySymbol.get(a.symbol);
    const p = a.params as { direction?: 'above' | 'below'; threshold?: number };
    if (ltp === undefined || typeof p.threshold !== 'number' || (p.direction !== 'above' && p.direction !== 'below')) continue;
    const distancePct = (Math.abs(ltp - p.threshold) / ltp) * 100;
    if (distancePct <= NEAR_ALERT_PCT) alertsNear.push({ symbol: a.symbol, direction: p.direction, threshold: p.threshold, ltp, distancePct });
  }
  alertsNear.sort((a, b) => a.distancePct - b.distancePct);

  return {
    totalCount: holdings.length,
    pricedCount: priced.length,
    totalValue,
    dayChangeAmount,
    dayChangePct: dayChangeAmount !== null && prior ? (dayChangeAmount / prior) * 100 : null,
    topContributor: byAmount[0] ?? null,
    topDetractor: byAmount.length > 1 ? byAmount[byAmount.length - 1] : null,
    biggestHolding: biggest && totalValue ? { symbol: biggest.symbol, weightPct: (value(biggest) / totalValue) * 100 } : null,
    topSector: topSector && totalValue ? { sector: topSector[0], weightPct: (topSector[1] / totalValue) * 100 } : null,
    alertsNear: alertsNear.slice(0, MAX_ALERTS_SHOWN),
  };
}

export function buildDashboardBriefPrompt(f: PortfolioFacts): string {
  const move =
    f.dayChangeAmount !== null && f.dayChangePct !== null
      ? `Today the portfolio moved ${signedInr(f.dayChangeAmount)} (${signedPct(f.dayChangePct)}) across ${f.pricedCount} priced holdings.`
      : `Today's move is ${NA}.`;
  const contrib = f.topContributor ? `Top contributor: ${f.topContributor.symbol} ${signedInr(f.topContributor.amount)}.` : '';
  const drag = f.topDetractor && f.topDetractor.amount < 0 ? `Biggest detractor: ${f.topDetractor.symbol} ${signedInr(f.topDetractor.amount)}.` : '';
  const exposure = [
    f.biggestHolding ? `Largest holding: ${f.biggestHolding.symbol} at ${f.biggestHolding.weightPct.toFixed(0)}% of the book.` : `Largest holding is ${NA}.`,
    f.topSector ? `Largest sector: ${f.topSector.sector} at ${f.topSector.weightPct.toFixed(0)}%.` : `Sector weights are ${NA}.`,
  ].join(' ');
  const alerts = f.alertsNear.length
    ? `Active price alerts within ${NEAR_ALERT_PCT}% of triggering: ${f.alertsNear
        .map((a) => `${a.symbol} ${a.direction} ₹${a.threshold.toLocaleString('en-IN')} (price ₹${a.ltp.toLocaleString('en-IN')}, ${a.distancePct.toFixed(1)}% away)`)
        .join('; ')}.`
    : `No active alert is within ${NEAR_ALERT_PCT}% of triggering.`;
  const gap = f.pricedCount < f.totalCount ? `${f.totalCount - f.pricedCount} of ${f.totalCount} holdings have no live price and are left out.` : '';
  return ['RETURN: ' + [move, contrib, drag].filter(Boolean).join(' '), 'EXPOSURE: ' + exposure, 'RISK: ' + alerts, gap].filter(Boolean).join('\n');
}

// ---------- Markets ----------

export interface MarketBriefInput {
  indices: ReadonlyArray<{ name: string; changePct: number }>;
  breadth: Breadth | null;
  sectors: readonly SectorMove[];
  headlines: ReadonlyArray<{ title: string }>;
}

export function buildMarketBriefPrompt(i: MarketBriefInput): string {
  // Index point levels are deliberately left out: the page shows them, and the brief must not repeat them.
  const idx = i.indices.length ? `Index moves today: ${i.indices.map((x) => `${x.name} ${signedPct(x.changePct)}`).join('; ')}.` : `Index moves are ${NA}.`;
  const breadth = i.breadth
    ? `BREADTH (NIFTY 50, ${i.breadth.total} names reporting): ${i.breadth.advances} advancing, ${i.breadth.declines} declining, ${i.breadth.unchanged} unchanged.`
    : `BREADTH: ${NA}.`;
  const ranked = [...i.sectors].sort((a, b) => b.changePct - a.changePct);
  const leaders = ranked.length
    ? `LEADERS AND LAGGARDS: leader ${ranked[0].label} ${signedPct(ranked[0].changePct)}; laggard ${ranked[ranked.length - 1].label} ${signedPct(ranked[ranked.length - 1].changePct)}.`
    : `LEADERS AND LAGGARDS: sector data ${NA}.`;
  const heads = i.headlines.length ? `HEADLINES:\n${i.headlines.map((h) => `- ${h.title}`).join('\n')}` : 'HEADLINES: none available.';
  return [idx, breadth, leaders, heads].join('\n');
}

// ---------- News ----------

export function buildNewsBriefPrompt(items: readonly NewsItem[]): { prompt: string; allowedTickers: Set<string> } {
  const allowedTickers = new Set<string>();
  const lines = items.map((n, i) => {
    for (const s of n.symbols) allowedTickers.add(s.toUpperCase());
    const tickers = n.symbols.length ? ` ${n.symbols.map((s) => `[${s.toUpperCase()}]`).join(' ')}` : '';
    return `${i + 1}. ${n.title}${tickers} (${n.source})`;
  });
  return { prompt: `Today's headlines (tickers in brackets are the only tickers you may tag):\n${lines.join('\n')}`, allowedTickers };
}

// ---------- IPO ----------

export interface IpoFacts {
  impliedListing: number | null;
  minInvestment: number | null;
}

export function ipoFacts(ipo: Pick<Ipo, 'price' | 'gmp' | 'lot_size'>): IpoFacts {
  return {
    impliedListing: ipo.price !== null && ipo.gmp !== null ? ipo.price + ipo.gmp : null,
    minInvestment: ipo.price !== null && ipo.lot_size !== null ? ipo.price * ipo.lot_size : null,
  };
}

/** An IPO with neither an issue price nor a size has too little structured data to brief: most items would read "not available". */
export function hasEnoughIpoData(ipo: Pick<Ipo, 'price' | 'ipo_size_cr'>): boolean {
  return ipo.price !== null || ipo.ipo_size_cr !== null;
}

export function buildIpoBriefPrompt(ipo: Ipo, grounding: readonly GroundingPassage[]): string {
  const f = ipoFacts(ipo);
  const rupee = (n: number | null) => (n === null ? NA : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  const listing = `LISTING: price ${rupee(ipo.price)}; GMP ${rupee(ipo.gmp)}${ipo.gmp_pct !== null ? ` (${ipo.gmp_pct.toFixed(1)}%)` : ''}; implied listing price ${f.impliedListing === null ? 'not available (do not state a listing price; a GMP alone is not one)' : rupee(f.impliedListing)}. GMP is an unofficial third-party grey-market estimate, not an exchange figure and not a forecast.`;
  const offer = `OFFER: ${ipo.category} issue, status ${ipo.status}; size ${ipo.ipo_size_cr !== null ? `₹${ipo.ipo_size_cr.toLocaleString('en-IN')} Cr` : NA}; lot ${ipo.lot_size ?? NA} shares (minimum investment ${rupee(f.minInvestment)}); subscription ${ipo.subscription_times !== null ? `${ipo.subscription_times}x` : NA}; anchor investors ${ipo.anchor === null ? NA : ipo.anchor ? 'yes' : 'no'}; opens ${ipo.open_date ?? NA}, closes ${ipo.close_date ?? NA}, lists ${ipo.listing_date ?? NA}.`;
  const passages = grounding.length
    ? `PASSAGES (the only source for business and risk):\n${grounding.map((p) => `- (${p.source}) ${p.text}`).join('\n')}`
    : 'BUSINESS: not available in our data. RISK: not available in our data. (Valuation against peers and the fresh-issue / offer-for-sale split are also not available.)';
  return [`IPO: ${ipo.name}.`, listing, offer, passages].join('\n');
}
