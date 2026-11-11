import { describe, expect, it } from 'vitest';
import type { Bar } from '@/lib/chart/bars';
import type { LineItemOut, PeerOut, RatioOut, ShareholdingOut } from '@/lib/dashboard/fundamentalsApi';
import { buildSignals, type SignalInputs } from './signals';

const ratio = (name: string, value: string | null): RatioOut => ({ name, value, unit: null, as_of: '', source_tier: 't' });
const line = (label: string, period_end: string, value: string | null): LineItemOut => ({ label, period_end, value, period_type: 'annual', unit: 'INR_CR', source_tier: 't' });
const sh = (category: string, quarter_end: string, percentage: string): ShareholdingOut => ({ category, quarter_end, percentage, source_tier: 't' });
const peer = (symbol: string, pe: string | null, is_target = false, extra: Partial<PeerOut> = {}): PeerOut =>
  ({ symbol, name: symbol, is_target, pe, cmp: null, market_cap: null, div_yield: null, net_profit_qtr: null, qtr_profit_var_pct: null, sales_qtr: null, qtr_sales_var_pct: null, roce_pct: null, as_of: '', source_tier: '', ...extra }) as PeerOut;
const bars = (n: number, close: (i: number) => number): Bar[] => Array.from({ length: n }, (_, i) => ({ time: `d${i}`, open: close(i), high: close(i), low: close(i), close: close(i), volume: 1 }));

const base: SignalInputs = {
  sector: 'Basic Materials',
  industry: 'Cement',
  ratios: [ratio('Stock P/E', '18'), ratio('Book Value', '1000'), ratio('Current Price', '1800'), ratio('ROCE', '14.8'), ratio('ROE', '11.2')],
  peers: [peer('ACC', '18', true, { qtr_sales_var_pct: '8.0', qtr_profit_var_pct: '-3.5' }), peer('A', '20'), peer('B', '24'), peer('C', '30')],
  price: 1800,
  bars: bars(210, (i) => 1000 + i),
  range52: { low: 1000, high: 2000 },
  profitAndLoss: [],
  balanceSheet: [],
  cashFlow: [],
  shareholding: [],
  news: [],
};

describe('valuation', () => {
  it('reads P/E, derives P/B and compares P/E with the peer median', () => {
    const v = buildSignals(base).valuation;
    expect(v.pe).toBe(18);
    expect(v.pb).toBeCloseTo(1.8, 5);
    expect(v.peerMedianPe).toBe(24);
    expect(v.peVsPeersPct).toBeCloseTo(-25, 5);
  });
  it('is null, not invented, when data is missing', () => {
    const v = buildSignals({ ...base, ratios: [], peers: [], price: null }).valuation;
    expect(v).toEqual({ pe: null, pb: null, peerMedianPe: null, peVsPeersPct: null });
  });
});

describe('quality', () => {
  const bs = [line('Borrowings', '2025-03-31', '500'), line('Equity Capital', '2025-03-31', '100'), line('Reserves', '2025-03-31', '900'), line('Borrowings', '2024-03-31', '9999')];
  it('reads ROCE and ROE, and debt/equity from the latest balance sheet', () => {
    const q = buildSignals({ ...base, balanceSheet: bs }).quality;
    expect(q.roce).toBe(14.8);
    expect(q.roe).toBe(11.2);
    expect(q.debtToEquity).toBeCloseTo(0.5, 5);
    expect(q.debtPeriod).toBe('2025-03-31');
  });
  it('skips debt/equity for financial companies, where borrowings are the business', () => {
    const q = buildSignals({ ...base, sector: 'Financial Services', balanceSheet: bs }).quality;
    expect(q.debtToEquity).toBeNull();
    expect(q.isFinancial).toBe(true);
  });
  it('takes free cash flow from the newest period even when rows arrive unsorted', () => {
    const cf = [line('Free Cash Flow', '2015-12-31', '337'), line('Free Cash Flow', '2025-03-31', '1200'), line('Free Cash Flow', '2020-03-31', '-50')];
    const q = buildSignals({ ...base, cashFlow: cf }).quality;
    expect(q.freeCashFlow).toEqual({ value: 1200, period: '2025-03-31' });
  });
});

describe('growth', () => {
  const pl = [
    line('Sales', '2022-03-31', '1000'),
    line('Sales', '2023-03-31', '1100'),
    line('Sales', '2024-03-31', '1250'),
    line('Sales', '2025-03-31', '1331'),
    line('Net Profit', '2022-03-31', '100'),
    line('Net Profit', '2023-03-31', '110'),
    line('Net Profit', '2024-03-31', '121'),
    line('Net Profit', '2025-03-31', '133.1'),
  ];
  it('computes 3-year CAGRs from the last four annual points', () => {
    const g = buildSignals({ ...base, profitAndLoss: pl }).growth;
    expect(g.salesCagr3y).toBeCloseTo(10, 0);
    expect(g.profitCagr3y).toBeCloseTo(10, 0);
  });
  it('accepts either revenue label', () => {
    const rev = pl.filter((l) => l.label === 'Sales').map((l) => ({ ...l, label: 'Revenue from Operations' }));
    expect(buildSignals({ ...base, profitAndLoss: rev }).growth.salesCagr3y).not.toBeNull();
  });
  it('is null when the history is too short or starts at zero or below', () => {
    expect(buildSignals({ ...base, profitAndLoss: pl.slice(0, 2) }).growth.salesCagr3y).toBeNull();
    const neg = pl.map((l) => (l.label === 'Net Profit' && l.period_end === '2022-03-31' ? { ...l, value: '-5' } : l));
    expect(buildSignals({ ...base, profitAndLoss: neg }).growth.profitCagr3y).toBeNull();
  });
  it('reads the latest-quarter YoY figures from the target peer row', () => {
    const g = buildSignals(base).growth;
    expect(g.qtrSalesYoyPct).toBe(8);
    expect(g.qtrProfitYoyPct).toBe(-3.5);
  });
});

describe('ownership', () => {
  const rows = [
    sh('Promoters', '2025-03-31', '56.0'), sh('Promoters', '2025-06-30', '56.5'), sh('Promoters', '2025-09-30', '56.7'),
    sh('Promoters', '2024-09-30', '55.0'), sh('Promoters', '2024-12-31', '55.5'),
    sh('FIIs', '2025-06-30', '10.0'), sh('FIIs', '2025-09-30', '11.2'),
    sh('DIIs', '2025-06-30', '22.0'), sh('DIIs', '2025-09-30', '21.4'),
  ];
  it('reports the latest holding and the quarter-on-quarter change', () => {
    const o = buildSignals({ ...base, shareholding: rows }).ownership;
    expect(o.promoter?.pct).toBe(56.7);
    expect(o.fii).toEqual({ pct: 11.2, delta1q: expect.closeTo(1.2, 5) });
    expect(o.dii).toEqual({ pct: 21.4, delta1q: expect.closeTo(-0.6, 5) });
    expect(o.latestQuarter).toBe('2025-09-30');
  });
  it('gives the promoter change over four quarters when there is enough history', () => {
    expect(buildSignals({ ...base, shareholding: rows }).ownership.promoter?.delta4q).toBeCloseTo(1.7, 5);
  });
  it('is empty when there is no shareholding data', () => {
    const o = buildSignals(base).ownership;
    expect(o).toMatchObject({ promoter: null, fii: null, dii: null, latestQuarter: null });
  });
});

describe('sentiment', () => {
  it('splits the latest headlines into positive / negative shares', () => {
    const news = [{ sentiment: 'positive' }, { sentiment: 'positive' }, { sentiment: 'negative' }, { sentiment: 'neutral' }] as const;
    const s = buildSignals({ ...base, news: [...news] }).sentiment;
    expect(s).toEqual({ total: 4, positivePct: 50, negativePct: 25 });
  });
  it('is zero-safe with no headlines', () => {
    expect(buildSignals(base).sentiment).toEqual({ total: 0, positivePct: null, negativePct: null });
  });
});

describe('technical', () => {
  it('measures distance from the 52-week high and from the 200-day average', () => {
    const t = buildSignals(base).technical;
    expect(t.fromHighPct).toBeCloseTo(-10, 5);
    // last 200 closes are 1010..1209, mean 1109.5
    expect(t.vs200dmPct).toBeCloseTo((1800 / 1109.5 - 1) * 100, 3);
  });
  it('has no 200-day figure with fewer than 200 bars', () => {
    expect(buildSignals({ ...base, bars: bars(50, () => 100) }).technical.vs200dmPct).toBeNull();
  });
  it('has nothing without any price or a range', () => {
    expect(buildSignals({ ...base, price: null, ratios: [], range52: null }).technical).toEqual({ fromHighPct: null, vs200dmPct: null });
  });
  it('falls back to the scraped current price when there is no live quote', () => {
    expect(buildSignals({ ...base, price: null }).technical.fromHighPct).toBeCloseTo(-10, 5);
  });
});

describe('coverage', () => {
  it('counts what the read is actually based on', () => {
    const c = buildSignals({ ...base, news: [{ sentiment: 'neutral' }], shareholding: [sh('FIIs', '2025-09-30', '1'), sh('FIIs', '2025-06-30', '1')], profitAndLoss: [line('Sales', '2024-03-31', '1'), line('Sales', '2025-03-31', '2')] }).coverage;
    expect(c).toEqual({ financialYears: 2, headlines: 1, quarters: 2 });
  });
  it('does not mutate its input', () => {
    const before = JSON.stringify(base);
    buildSignals(base);
    expect(JSON.stringify(base)).toBe(before);
  });
});
