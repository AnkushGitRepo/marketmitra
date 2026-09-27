import type { LineItemOut, PricePeriod, PricePointOut, ShareholdingOut } from './fundamentalsApi';
import type { RangeSeries } from './chartMath';

export interface FinTable {
  cols: string[];
  rows: { label: string; cells: string[] }[];
}

// The API has no stored row-display-order (Postgres gives no ordering
// guarantee across labels sharing a period_end), so rows come back in an
// effectively arbitrary order. These mirror Screener.in's real row order
// for each statement — confirmed against live RELIANCE data — so the table
// reads top-to-bottom the way an investor expects. Any label not listed
// here (a company-specific line item) is appended after the known ones,
// in whatever order it was encountered, rather than dropped.
const ROW_ORDER: Record<string, string[]> = {
  profit_and_loss: [
    'Sales', 'Expenses', 'Operating Profit', 'OPM %', 'Other Income', 'Interest',
    'Depreciation', 'Profit before tax', 'Tax %', 'Net Profit', 'EPS in Rs', 'Dividend Payout %',
  ],
  balance_sheet: [
    'Equity Capital', 'Reserves', 'Borrowings', 'Other Liabilities', 'Total Liabilities',
    'Fixed Assets', 'CWIP', 'Investments', 'Other Assets', 'Total Assets',
  ],
  cash_flow: [
    'Cash from Operating Activity', 'Cash from Investing Activity', 'Cash from Financing Activity',
    'Net Cash Flow', 'Free Cash Flow', 'CFO/OP',
  ],
};

/** Pivots flat {label, period_end, value}[] line items into a wide table:
 * one column per period (sorted oldest → newest), rows ordered per
 * ROW_ORDER above (falling back to first-seen order for anything unlisted). */
export function pivotFinancials(items: LineItemOut[], statementKey?: string): FinTable {
  const periods = [...new Set(items.map((i) => i.period_end))].sort();
  const labelOrder: string[] = [];
  const byLabel = new Map<string, Map<string, string>>();

  for (const item of items) {
    if (!byLabel.has(item.label)) {
      byLabel.set(item.label, new Map());
      labelOrder.push(item.label);
    }
    if (item.value !== null) {
      byLabel.get(item.label)!.set(item.period_end, formatCrore(item.value));
    }
  }

  const canonical = statementKey ? ROW_ORDER[statementKey] : undefined;
  if (canonical) {
    const rank = new Map(canonical.map((label, i) => [label, i]));
    labelOrder.sort((a, b) => (rank.get(a) ?? canonical.length) - (rank.get(b) ?? canonical.length));
  }

  return {
    cols: ['', ...periods.map(formatPeriodHeader)],
    rows: labelOrder.map((label) => ({
      label,
      cells: periods.map((p) => byLabel.get(label)?.get(p) ?? '—'),
    })),
  };
}

/** Formats a ratio's raw {value, unit} into display text, e.g.
 * ("668.0000", "INR") -> "₹668", ("0.4500", "%") -> "0.45%". */
export function formatRatioValue(value: string | null, unit: string | null): string {
  if (value === null) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  const formatted = n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  if (unit === 'INR') return `₹${formatted}`;
  if (unit === '%') return `${formatted}%`;
  if (unit) return `${formatted} ${unit}`;
  return formatted;
}

function formatCrore(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatPeriodHeader(periodEnd: string): string {
  const d = new Date(periodEnd);
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

export const MAX_CHART_POINTS = 12;

/** Downsamples a dense series to a chart-friendly point count (the source
 * design's charts were built for ~8-12 points; a raw 5-year daily series is
 * 1000+ points, too dense to label sensibly). Always keeps the last item. */
export function downsample<T>(items: T[], maxPoints: number = MAX_CHART_POINTS): T[] {
  if (items.length === 0) return [];
  const step = Math.max(1, Math.floor(items.length / maxPoints));
  const sampled: T[] = [];
  for (let i = 0; i < items.length; i += step) {
    sampled.push(items[i]);
  }
  const last = items[items.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

export function toRangeSeries(points: PricePointOut[], period: PricePeriod): RangeSeries {
  // fundamentals-api's /prices returns newest-first; a time-series chart
  // reads old → new left to right, so reverse to chronological order.
  // downsample() keeps the last item, which is now the most recent point.
  const withClose = points.filter((p) => p.close !== null).slice().reverse();
  if (withClose.length === 0) return { v: [], l: [] };

  const sampled = downsample(withClose);

  return {
    v: sampled.map((p) => Number(p.close)),
    l: sampled.map((p) => formatPriceLabel(p.trade_date, period)),
  };
}

export function formatPriceLabel(tradeDate: string, period: PricePeriod): string {
  const d = new Date(tradeDate);
  if (period === '1mo') return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (period === '5y') return d.toLocaleDateString('en-IN', { year: 'numeric' });
  return d.toLocaleDateString('en-IN', { month: 'short' });
}

/** The "About" copy (Tier 3 / Screener.in, often lifted from a source like
 * Wikipedia) frequently retains citation markers (e.g. "...in 1994[1][2]")
 * that mean nothing without the footnotes they pointed to — and not only
 * at the end of the paragraph; a real example (Federal Bank) has one
 * stranded mid-sentence: "...foreign exchange business. [1] .It is...".
 * Strips every "[n]" marker, wherever it falls, collapsing the resulting
 * double space so removing a mid-sentence marker doesn't leave one. */
export function stripCitationMarkers(text: string): string {
  return text
    .replace(/\s?\[\d+\]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export interface ShareholdingSeries {
  category: string;
  color: string;
  points: { quarterEnd: string; percentage: number }[];
}

const CATEGORY_COLORS: Record<string, string> = {
  Promoters: '#0C8A6C',
  DIIs: '#17C39A',
  FIIs: '#C9AF7E',
  Government: '#8A7433',
  Public: '#9AA3AB',
  Others: '#A6E8D3',
};
const FALLBACK_COLORS = ['#3FD0AB', '#7FDFC2', '#E2DED2', '#D9917F'];

/** Groups flat {category, quarter_end, percentage}[] entries into one
 * chronological series per category, for the shareholding trend chart. */
export function groupShareholding(entries: ShareholdingOut[]): ShareholdingSeries[] {
  const byCategory = new Map<string, { quarterEnd: string; percentage: number }[]>();
  for (const e of entries) {
    if (!byCategory.has(e.category)) byCategory.set(e.category, []);
    byCategory.get(e.category)!.push({ quarterEnd: e.quarter_end, percentage: Number(e.percentage) });
  }

  let fallbackIndex = 0;
  return [...byCategory.entries()].map(([category, points]) => {
    const color = CATEGORY_COLORS[category] ?? FALLBACK_COLORS[fallbackIndex++ % FALLBACK_COLORS.length];
    return { category, color, points: points.sort((a, b) => a.quarterEnd.localeCompare(b.quarterEnd)) };
  });
}
