// The computed data behind the stock page's 360 brief (#115, ADR 0056). Everything here is arithmetic on
// data we already hold; a figure we cannot compute is null and shown as "not available", never estimated.

import type { Bar } from '@/lib/chart/bars';
import type { LineItemOut, PeerOut, RatioOut, ShareholdingOut } from '@/lib/dashboard/fundamentalsApi';
import type { NewsSentiment } from '@/lib/dashboard/newsApi';
import { medianPeerPe } from './keyRatios';

export interface SignalInputs {
  sector: string | null;
  industry: string | null;
  ratios: readonly RatioOut[];
  peers: readonly PeerOut[];
  /** Live price when known. */
  price: number | null;
  /** Daily bars, oldest first. */
  bars: readonly Bar[];
  range52: { low: number; high: number } | null;
  profitAndLoss: readonly LineItemOut[];
  balanceSheet: readonly LineItemOut[];
  cashFlow: readonly LineItemOut[];
  shareholding: readonly ShareholdingOut[];
  news: ReadonlyArray<{ sentiment: NewsSentiment }>;
}

export interface Holding {
  pct: number;
  /** Change since the previous quarter, in percentage points. */
  delta1q: number | null;
}

export interface StockSignals {
  valuation: { pe: number | null; pb: number | null; peerMedianPe: number | null; peVsPeersPct: number | null };
  quality: {
    roce: number | null;
    roe: number | null;
    /** Borrowings / (equity capital + reserves), latest balance sheet. Null for financial companies. */
    debtToEquity: number | null;
    debtPeriod: string | null;
    freeCashFlow: { value: number; period: string } | null;
    isFinancial: boolean;
  };
  growth: { salesCagr3y: number | null; profitCagr3y: number | null; qtrSalesYoyPct: number | null; qtrProfitYoyPct: number | null };
  ownership: {
    promoter: (Holding & { delta4q: number | null }) | null;
    fii: Holding | null;
    dii: Holding | null;
    latestQuarter: string | null;
  };
  sentiment: { total: number; positivePct: number | null; negativePct: number | null };
  technical: { fromHighPct: number | null; vs200dmPct: number | null };
  coverage: { financialYears: number; headlines: number; quarters: number };
}

const DMA_DAYS = 200;
const CAGR_POINTS = 4;
const MS_PER_YEAR = 365.25 * 86_400_000;
const SALES_LABELS = ['Sales', 'Revenue from Operations', 'Revenue'] as const;

const num = (s: string | null | undefined): number | null => {
  if (s === null || s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const ratioValue = (ratios: readonly RatioOut[], name: string) => num(ratios.find((r) => r.name === name)?.value);

/** One value per period for the first label that has data, oldest first. */
function series(items: readonly LineItemOut[], labels: readonly string[]): Array<{ period: string; value: number }> {
  for (const label of labels) {
    const byPeriod = new Map<string, number>();
    for (const i of items) {
      const v = i.label === label ? num(i.value) : null;
      if (v !== null) byPeriod.set(i.period_end, v);
    }
    if (byPeriod.size > 0) return [...byPeriod].map(([period, value]) => ({ period, value })).sort((a, b) => a.period.localeCompare(b.period));
  }
  return [];
}

function latestOf(items: readonly LineItemOut[], label: string): { period: string; value: number } | null {
  return series(items, [label]).at(-1) ?? null;
}

/** Compound annual growth, in percent, across the last four points. Null if the history is short or the base is not positive. */
function cagr(points: Array<{ period: string; value: number }>): number | null {
  if (points.length < CAGR_POINTS) return null;
  const window = points.slice(-CAGR_POINTS);
  const start = window[0];
  const end = window[window.length - 1];
  const years = (new Date(end.period).getTime() - new Date(start.period).getTime()) / MS_PER_YEAR;
  if (!(years >= 2) || start.value <= 0 || end.value <= 0) return null;
  return (Math.pow(end.value / start.value, 1 / years) - 1) * 100;
}

function holding(rows: readonly ShareholdingOut[], category: string): { latest: Holding; all: Array<{ q: string; v: number }> } | null {
  const all = rows
    .filter((r) => r.category === category && num(r.percentage) !== null)
    .map((r) => ({ q: r.quarter_end, v: Number(r.percentage) }))
    .sort((a, b) => a.q.localeCompare(b.q));
  if (all.length === 0) return null;
  const last = all[all.length - 1];
  const prev = all.length > 1 ? all[all.length - 2] : null;
  return { latest: { pct: last.v, delta1q: prev ? last.v - prev.v : null }, all };
}

const isFinancialCompany = (sector: string | null, industry: string | null) => /financ|bank|insur/i.test(`${sector ?? ''} ${industry ?? ''}`);

export function buildSignals(i: SignalInputs): StockSignals {
  const financial = isFinancialCompany(i.sector, i.industry);

  // Valuation
  const pe = ratioValue(i.ratios, 'Stock P/E');
  const book = ratioValue(i.ratios, 'Book Value');
  const px = i.price ?? ratioValue(i.ratios, 'Current Price');
  const median = medianPeerPe(i.peers);

  // Quality
  const borrowings = latestOf(i.balanceSheet, 'Borrowings');
  const equity = latestOf(i.balanceSheet, 'Equity Capital');
  const reserves = latestOf(i.balanceSheet, 'Reserves');
  const netWorth = equity && reserves ? equity.value + reserves.value : null;
  const fcf = latestOf(i.cashFlow, 'Free Cash Flow');

  // Growth
  const target = i.peers.find((p) => p.is_target);

  // Ownership
  const promoter = holding(i.shareholding, 'Promoters');
  const fii = holding(i.shareholding, 'FIIs');
  const dii = holding(i.shareholding, 'DIIs');
  const quarters = new Set(i.shareholding.map((r) => r.quarter_end));
  const latestQuarter = quarters.size ? [...quarters].sort().at(-1)! : null;
  const promoter4q = promoter && promoter.all.length >= 5 ? promoter.latest.pct - promoter.all[promoter.all.length - 5].v : null;

  // Sentiment
  const total = i.news.length;
  const pct = (kind: NewsSentiment) => (total === 0 ? null : (i.news.filter((n) => n.sentiment === kind).length / total) * 100);

  // Technical
  const closes = i.bars.map((b) => b.close).filter(Number.isFinite);
  const sma200 = closes.length >= DMA_DAYS ? closes.slice(-DMA_DAYS).reduce((a, b) => a + b, 0) / DMA_DAYS : null;

  const years = Math.max(...[i.profitAndLoss, i.balanceSheet, i.cashFlow].map((s) => new Set(s.map((l) => l.period_end)).size), 0);

  return {
    valuation: {
      pe,
      pb: book !== null && book > 0 && px !== null ? px / book : null,
      peerMedianPe: median,
      peVsPeersPct: pe !== null && median !== null && median > 0 ? (pe / median - 1) * 100 : null,
    },
    quality: {
      roce: ratioValue(i.ratios, 'ROCE'),
      roe: ratioValue(i.ratios, 'ROE'),
      debtToEquity: !financial && borrowings && netWorth !== null && netWorth > 0 ? borrowings.value / netWorth : null,
      debtPeriod: !financial && borrowings && netWorth !== null && netWorth > 0 ? borrowings.period : null,
      freeCashFlow: !financial && fcf ? { value: fcf.value, period: fcf.period } : null,
      isFinancial: financial,
    },
    growth: {
      salesCagr3y: cagr(series(i.profitAndLoss, SALES_LABELS)),
      profitCagr3y: cagr(series(i.profitAndLoss, ['Net Profit'])),
      qtrSalesYoyPct: num(target?.qtr_sales_var_pct),
      qtrProfitYoyPct: num(target?.qtr_profit_var_pct),
    },
    ownership: {
      promoter: promoter ? { ...promoter.latest, delta4q: promoter4q } : null,
      fii: fii ? fii.latest : null,
      dii: dii ? dii.latest : null,
      latestQuarter,
    },
    sentiment: { total, positivePct: pct('positive'), negativePct: pct('negative') },
    technical: {
      fromHighPct: px !== null && i.range52 ? (px / i.range52.high - 1) * 100 : null,
      vs200dmPct: px !== null && sma200 !== null ? (px / sma200 - 1) * 100 : null,
    },
    coverage: { financialYears: years, headlines: total, quarters: quarters.size },
  };
}
