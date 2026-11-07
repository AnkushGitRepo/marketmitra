import { getPrices, type PricePointOut } from '@/lib/dashboard/fundamentalsApi';
import { listEntries } from '../journal/store';
import { buildPaperReport, type PaperReport, type PricePoint } from './paper';

/** The Nifty 50 index fund used as the yardstick. */
export const BENCHMARK_SYMBOL = 'NIFTYBEES';

function toSeries(rows: PricePointOut[] | null): PricePoint[] {
  return (rows ?? [])
    .map((r) => ({ date: r.trade_date, close: r.close === null ? NaN : Number(r.close) }))
    .filter((p) => Number.isFinite(p.close) && p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type PerformanceOutcome = { ok: true; report: PaperReport; benchmark: string } | { ok: false; error: string };

/** Paper-trade every recorded stock recommendation against the benchmark. */
export async function getPerformance(userId: string, asOf: string): Promise<PerformanceOutcome> {
  const entries = (await listEntries(userId)).filter((e) => e.kind === 'stock');
  const symbols = [...new Set(entries.map((e) => e.symbol.toUpperCase()))];
  const [bench, ...stocks] = await Promise.all([
    getPrices(BENCHMARK_SYMBOL, '5y'),
    ...symbols.map((s) => getPrices(s, '5y')),
  ]);
  const benchmark = toSeries(bench);
  if (benchmark.length === 0) return { ok: false, error: `No price history for the benchmark (${BENCHMARK_SYMBOL}).` };
  const prices: Record<string, PricePoint[]> = {};
  symbols.forEach((s, i) => (prices[s] = toSeries(stocks[i])));

  const report = buildPaperReport({
    entries: entries.map((e) => ({
      id: e.id,
      symbol: e.symbol,
      name: e.name,
      createdAt: e.createdAt,
      amountINR: e.amountINR,
      priceAtTime: e.priceAtTime,
    })),
    prices,
    benchmark,
    asOf,
  });
  return { ok: true, report, benchmark: BENCHMARK_SYMBOL };
}
