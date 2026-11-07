// Paper-trading tracker: every recorded recommendation is treated as a
// hypothetical purchase at that day's close, and compared with putting the same
// rupees into a Nifty 50 index fund on the same day. Pure — prices are passed in.
// This is forward tracking only; there is deliberately no backtest here.

export interface PricePoint {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface PaperEntry {
  id: string;
  symbol: string;
  name: string;
  /** ISO timestamp the recommendation was recorded. */
  createdAt: string;
  amountINR: number;
  /** Quote at recording time; used only if the close series has no earlier price. */
  priceAtTime: number | null;
}

export interface PaperConfig {
  /** A sleeve that trails the benchmark over entries at least this old triggers the warning. */
  windowDays: number;
  /** Fewer entries than this in the window → no verdict. */
  minEntries: number;
  /** Annualised figures are shown only after this many days (shorter spans mislead). */
  minDaysForAnnualised: number;
}

export const DEFAULT_PAPER_CONFIG: PaperConfig = {
  windowDays: 180,
  minEntries: 3,
  minDaysForAnnualised: 365,
};

export interface EntryResult {
  id: string;
  symbol: string;
  name: string;
  entryDate: string;
  amountINR: number;
  buyPrice: number | null;
  currentValueINR: number | null;
  benchmarkValueINR: number | null;
  returnPct: number | null;
  benchmarkReturnPct: number | null;
  /** Stock return minus benchmark return, in percentage points. */
  excessPts: number | null;
  daysHeld: number;
}

export interface SeriesRow {
  date: string;
  investedINR: number;
  sleeveValueINR: number;
  benchmarkValueINR: number;
  sleeveReturnPct: number;
  benchmarkReturnPct: number;
  excessPts: number;
}

export type TrailingStatus = 'insufficient' | 'trailing' | 'ahead';

export interface PaperReport {
  asOf: string;
  entries: EntryResult[];
  totals: {
    investedINR: number;
    sleeveValueINR: number;
    benchmarkValueINR: number;
    sleeveReturnPct: number | null;
    benchmarkReturnPct: number | null;
    excessPts: number | null;
    sleeveXirrPct: number | null;
    benchmarkXirrPct: number | null;
    /** Entries that could not be priced and are excluded from the totals. */
    unpriced: number;
  };
  series: SeriesRow[];
  warning: { status: TrailingStatus; message: string };
}

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
const pct = (now: number, then: number) => ((now - then) / then) * 100;

/** Latest price on or before `date` (series ascending); null if none. */
export function closeOnOrBefore(series: PricePoint[], date: string): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let ans: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= date) {
      ans = series[mid].close;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Money-weighted annual return for dated cash flows (negative = invested). */
export function xirr(flows: Array<{ date: string; amount: number }>): number | null {
  if (flows.length < 2) return null;
  const t0 = Date.parse(flows[0].date);
  const npv = (rate: number) =>
    flows.reduce((s, f) => s + f.amount / (1 + rate) ** ((Date.parse(f.date) - t0) / DAY_MS / 365), 0);
  let lo = -0.99;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}

function monthEnds(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split('-').map(Number);
  let y = fy;
  let m = fm;
  for (;;) {
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    if (last >= to) break;
    if (last >= from) out.push(last);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

const f1 = (n: number) => n.toFixed(1);

export function buildPaperReport(args: {
  entries: PaperEntry[];
  prices: Record<string, PricePoint[]>;
  benchmark: PricePoint[];
  asOf: string;
  config?: PaperConfig;
}): PaperReport {
  const cfg = args.config ?? DEFAULT_PAPER_CONFIG;
  const { asOf, benchmark } = args;
  const benchNow = closeOnOrBefore(benchmark, asOf);

  const rows = args.entries.map((e) => {
    const entryDate = e.createdAt.slice(0, 10);
    const series = args.prices[e.symbol.toUpperCase()] ?? [];
    const buy = closeOnOrBefore(series, entryDate) ?? e.priceAtTime;
    const now = closeOnOrBefore(series, asOf);
    const benchBuy = closeOnOrBefore(benchmark, entryDate);
    const priced = buy !== null && buy > 0 && now !== null && benchBuy !== null && benchBuy > 0 && benchNow !== null;
    const value = priced ? (e.amountINR / buy!) * now! : null;
    const benchValue = priced ? (e.amountINR / benchBuy!) * benchNow! : null;
    const result: EntryResult = {
      id: e.id,
      symbol: e.symbol,
      name: e.name,
      entryDate,
      amountINR: e.amountINR,
      buyPrice: buy,
      currentValueINR: value,
      benchmarkValueINR: benchValue,
      returnPct: value !== null ? pct(value, e.amountINR) : null,
      benchmarkReturnPct: benchValue !== null ? pct(benchValue, e.amountINR) : null,
      excessPts: value !== null && benchValue !== null ? pct(value, e.amountINR) - pct(benchValue, e.amountINR) : null,
      daysHeld: Math.max(0, daysBetween(entryDate, asOf)),
    };
    return { e, result, buy, benchBuy };
  });

  const priced = rows.filter((r) => r.result.currentValueINR !== null);
  const invested = priced.reduce((s, r) => s + r.e.amountINR, 0);
  const sleeve = priced.reduce((s, r) => s + (r.result.currentValueINR as number), 0);
  const bench = priced.reduce((s, r) => s + (r.result.benchmarkValueINR as number), 0);
  const sleeveRet = invested > 0 ? pct(sleeve, invested) : null;
  const benchRet = invested > 0 ? pct(bench, invested) : null;

  const firstDate = priced.map((r) => r.result.entryDate).sort()[0];
  const longEnough = firstDate !== undefined && daysBetween(firstDate, asOf) >= cfg.minDaysForAnnualised;
  const flows = (valueOf: (r: (typeof priced)[number]) => number) =>
    [
      ...priced.map((r) => ({ date: r.result.entryDate, amount: -r.e.amountINR })).sort((a, b) => a.date.localeCompare(b.date)),
      { date: asOf, amount: priced.reduce((s, r) => s + valueOf(r), 0) },
    ];

  // Month-end history, including the losing stretches.
  const series: SeriesRow[] = [];
  if (priced.length > 0) {
    const dates = [...monthEnds(firstDate, asOf), asOf];
    for (const d of dates) {
      const live = priced.filter((r) => r.result.entryDate <= d);
      if (live.length === 0) continue;
      let inv = 0;
      let sv = 0;
      let bv = 0;
      for (const r of live) {
        const px = closeOnOrBefore(args.prices[r.e.symbol.toUpperCase()] ?? [], d);
        const bpx = closeOnOrBefore(benchmark, d);
        if (px === null || bpx === null) continue;
        inv += r.e.amountINR;
        sv += (r.e.amountINR / (r.buy as number)) * px;
        bv += (r.e.amountINR / (r.benchBuy as number)) * bpx;
      }
      if (inv === 0) continue;
      series.push({
        date: d,
        investedINR: inv,
        sleeveValueINR: sv,
        benchmarkValueINR: bv,
        sleeveReturnPct: pct(sv, inv),
        benchmarkReturnPct: pct(bv, inv),
        excessPts: pct(sv, inv) - pct(bv, inv),
      });
    }
  }

  // Trailing-benchmark warning on the cohort old enough to judge.
  const cohort = priced.filter((r) => r.result.daysHeld >= cfg.windowDays);
  let warning: PaperReport['warning'];
  if (cohort.length < cfg.minEntries) {
    warning = {
      status: 'insufficient',
      message: `Too early to judge: ${cohort.length} recommendation(s) are ${cfg.windowDays}+ days old and at least ${cfg.minEntries} are needed. A short record says little either way.`,
    };
  } else {
    const ci = cohort.reduce((s, r) => s + r.e.amountINR, 0);
    const cs = cohort.reduce((s, r) => s + (r.result.currentValueINR as number), 0);
    const cb = cohort.reduce((s, r) => s + (r.result.benchmarkValueINR as number), 0);
    const sr = pct(cs, ci);
    const br = pct(cb, ci);
    warning =
      sr < br
        ? {
            status: 'trailing',
            message: `Your ${cohort.length} stock picks at least ${cfg.windowDays} days old returned ${f1(sr)}% against ${f1(br)}% for the Nifty 50 fund over the same dates — the stock sleeve is trailing. Consider giving more weight to the index core (lower satellitePct in your policy). Past results do not predict future ones.`,
          }
        : {
            status: 'ahead',
            message: `Your ${cohort.length} stock picks at least ${cfg.windowDays} days old returned ${f1(sr)}% against ${f1(br)}% for the Nifty 50 fund. That is a small sample and not proof of skill; keep tracking.`,
          };
  }

  return {
    asOf,
    entries: rows.map((r) => r.result),
    totals: {
      investedINR: invested,
      sleeveValueINR: sleeve,
      benchmarkValueINR: bench,
      sleeveReturnPct: sleeveRet,
      benchmarkReturnPct: benchRet,
      excessPts: sleeveRet !== null && benchRet !== null ? sleeveRet - benchRet : null,
      sleeveXirrPct: longEnough ? xirr(flows((r) => r.result.currentValueINR as number)) : null,
      benchmarkXirrPct: longEnough ? xirr(flows((r) => r.result.benchmarkValueINR as number)) : null,
      unpriced: rows.length - priced.length,
    },
    series,
    warning,
  };
}
