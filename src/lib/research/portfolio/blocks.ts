// The cards, charts and tables of the portfolio report (#390), computed from the holdings and the data service's figures. They go
// beyond /portfolio: what carried the result, how deep each loss is, what the book is weighted towards, and a volatility range.

import type { ResearchBlock, TableColumn, Tone } from '../blocks';
import { formatNumber, formatPercent, formatRupeesShort } from '../formatters';
import {
  attribution,
  debtOf,
  factorShares,
  healthScore,
  isLossMaking,
  riskRegister,
  roceOf,
  roeOf,
  scenarioRange,
  severityOf,
  totalValue,
  weightedAverage,
  weightedPe,
  type Position,
  type Severity,
} from './analysis';

const MAX_BARS = 8;
const MISSING = '—';
const pct = (v: number | null): string => (v === null ? MISSING : `${formatNumber(v)}%`);
const toneOf = (n: number): Tone => (n > 0 ? 'positive' : n < 0 ? 'negative' : 'neutral');

/** Chapter 1: the four-card strip and the chart of what carried and what dragged. */
export function healthBlocks(positions: readonly Position[]): ResearchBlock[] {
  if (positions.length === 0) return [];
  const a = attribution(positions);
  const health = healthScore(positions);
  const critical = positions.filter((p) => severityOf(p.plPct) === 'CRITICAL').length;
  const roce = weightedAverage(positions, roceOf);
  const pe = weightedPe(positions);
  const movers = [...a.winners.slice(0, MAX_BARS / 2), ...a.losers.slice(0, MAX_BARS / 2)].sort((x, y) => (y.pl as number) - (x.pl as number));
  return [
    {
      type: 'kpi_grid',
      items: [
        { label: 'Health score', value: `${health.score} / 100`, note: `${health.label} · ${health.deductions.length === 0 ? 'no weaknesses found' : `${health.deductions.length} deduction${health.deductions.length === 1 ? '' : 's'}, see the risk register`}`, tone: health.label === 'Healthy' ? 'positive' : health.label === 'Stressed' ? 'negative' : 'neutral' },
        {
          label: 'Gain concentration',
          value: a.gainConcentrationPct === null ? MISSING : `${formatNumber(a.gainConcentrationPct)}%`,
          note: a.gainConcentrationPct === null ? 'The book is not in profit overall' : `Top ${a.topWinners} winner${a.topWinners === 1 ? '' : 's'} as a share of the net P&L`,
        },
        { label: 'Critical drawdowns', value: String(critical), note: `Holdings 30% or more below cost`, tone: critical > 0 ? 'negative' : 'neutral' },
        {
          label: 'Weighted ROCE · P/E',
          value: `${roce.value === null ? MISSING : pct(roce.value)} · ${pe.value === null ? MISSING : `${formatNumber(pe.value)}x`}`,
          note: `By value, over ${formatNumber(Math.min(roce.coveragePct, pe.coveragePct))}% of the portfolio`,
        },
      ],
    },
    ...(movers.length === 0
      ? []
      : [
          {
            type: 'bar_chart' as const,
            title: 'What carried the result and what dragged it',
            unit: '₹ profit or loss',
            orientation: 'horizontal' as const,
            categories: movers.map((p) => p.symbol),
            series: [{ name: 'Unrealised P&L', values: movers.map((p) => Math.round(p.pl as number)) }],
          },
          {
            type: 'kpi_grid' as const,
            items: [
              { label: 'Net unrealised P&L', value: formatRupeesShort(a.netPl), tone: toneOf(a.netPl), note: `${a.winners.length} gaining, ${a.losers.length} losing` },
              { label: 'Gains from winners', value: formatRupeesShort(a.winners.reduce((s, p) => s + (p.pl as number), 0)), tone: 'positive' as const },
              { label: 'Losses from losers', value: formatRupeesShort(a.losers.reduce((s, p) => s + (p.pl as number), 0)), tone: 'negative' as const },
            ],
          },
        ]),
  ];
}

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, MODERATE: 1, NORMAL: 2 };

/** Chapter 2: every holding below cost, tagged by how deep the loss is. Why it fell is the model's job (the chapter's text). */
export function losersBlocks(positions: readonly Position[]): ResearchBlock[] {
  const losing = positions.filter((p) => severityOf(p.plPct) !== null).sort((a, b) => SEVERITY_ORDER[severityOf(a.plPct)!] - SEVERITY_ORDER[severityOf(b.plPct)!] || (a.plPct as number) - (b.plPct as number));
  if (losing.length === 0) return [];
  const columns: readonly TableColumn[] = [
    { key: 'name', label: 'Holding', format: 'text' },
    { key: 'severity', label: 'Severity', format: 'text' },
    { key: 'plPct', label: 'vs cost', format: 'percent' },
    { key: 'pl', label: 'P&L (₹)', format: 'rupee' },
    { key: 'weight', label: 'Weight', format: 'percent' },
    { key: 'pe', label: 'P/E', format: 'multiple' },
    { key: 'roe', label: 'ROE', format: 'percent' },
    { key: 'debt', label: 'Debt / equity', format: 'number' },
  ];
  return [
    {
      type: 'card_grid',
      title: 'Drawdown severity',
      columns: 2,
      numbered: false,
      cards: losing.map((p) => ({
        heading: `${p.symbol} · ${formatPercent(p.plPct as number)}`,
        text: `Bought at ₹${formatNumber(p.avgPrice)}, now ₹${formatNumber(p.ltp as number)}: ${formatRupeesShort(p.pl as number)} on ${formatRupeesShort(p.invested)} invested.`,
        tag: severityOf(p.plPct)!,
      })),
    },
    {
      type: 'data_table',
      title: 'Holdings below cost',
      note: 'CRITICAL is 30% or more below cost, MODERATE 15% to 30%, NORMAL under 15%. The reasons are in the text below.',
      columns,
      rows: losing.map((p) => ({
        name: p.name,
        severity: severityOf(p.plPct),
        plPct: p.plPct,
        pl: p.pl,
        weight: p.weightPct,
        pe: p.fundamentals?.pe ?? null,
        roe: roeOf(p),
        debt: debtOf(p),
      })),
    },
  ];
}

/** Chapter 3: how much of the book each economic driver carries. */
export function factorBlocks(positions: readonly Position[]): ResearchBlock[] {
  if (positions.length === 0) return [];
  const shares = factorShares(positions);
  return [
    {
      type: 'bar_chart',
      title: 'Economic drivers behind the holdings',
      unit: '% of portfolio value',
      orientation: 'horizontal',
      categories: shares.map((s) => s.factor),
      series: [{ name: 'Share of value', values: shares.map((s) => Math.round(s.weightPct * 10) / 10) }],
    },
    {
      type: 'data_table',
      title: 'Which holdings sit in each driver',
      note: 'Read from each company’s sector and industry name; a company can be exposed to more than one driver.',
      columns: [
        { key: 'factor', label: 'Driver', format: 'text' },
        { key: 'weight', label: 'Weight', format: 'percent' },
        { key: 'symbols', label: 'Holdings', format: 'text' },
      ],
      rows: shares.map((s) => ({ factor: s.factor, weight: s.weightPct, symbols: s.symbols.join(', ') })),
    },
  ];
}

/** Chapter 4: weighted quality and valuation, then each holding's own figures. */
export function qualityBlocks(positions: readonly Position[]): ResearchBlock[] {
  if (positions.length === 0) return [];
  const pe = weightedPe(positions);
  const roce = weightedAverage(positions, roceOf);
  const roe = weightedAverage(positions, roeOf);
  const debt = weightedAverage(positions, debtOf);
  const withData = positions.filter((p) => p.fundamentals !== null);
  const loss = positions.filter(isLossMaking).length;
  const cover = (w: { coveragePct: number }): string => `By value, over ${formatNumber(w.coveragePct)}% of the book`;
  return [
    {
      type: 'kpi_grid',
      items: [
        { label: 'Weighted P/E', value: pe.value === null ? MISSING : `${formatNumber(pe.value)}x`, note: `${cover(pe)}; loss-makers left out` },
        { label: 'Weighted ROCE', value: pct(roce.value), note: cover(roce) },
        { label: 'Weighted ROE', value: pct(roe.value), note: cover(roe) },
        { label: 'Weighted debt / equity', value: debt.value === null ? MISSING : formatNumber(debt.value), note: cover(debt) },
        { label: 'Profitable · loss-making', value: `${withData.length - loss} · ${loss}`, note: `${positions.length - withData.length} without data` },
      ],
    },
    {
      type: 'data_table',
      title: 'Each holding’s quality and valuation',
      note: 'From the data service; "—" means it holds no figure for that company.',
      columns: [
        { key: 'name', label: 'Holding', format: 'text' },
        { key: 'weight', label: 'Weight', format: 'percent' },
        { key: 'pe', label: 'P/E', format: 'multiple', best: 'low' },
        { key: 'pb', label: 'P/B', format: 'multiple' },
        { key: 'roce', label: 'ROCE', format: 'percent', best: 'high' },
        { key: 'roe', label: 'ROE', format: 'percent', best: 'high' },
        { key: 'debt', label: 'Debt / equity', format: 'number', best: 'low' },
        { key: 'sales', label: 'Sales 3y CAGR', format: 'percent' },
        { key: 'profit', label: 'Profit 3y CAGR', format: 'percent' },
      ],
      rows: positions.map((p) => ({
        name: p.name,
        weight: p.weightPct,
        pe: p.fundamentals?.pe ?? null,
        pb: p.fundamentals?.pb ?? null,
        roce: roceOf(p),
        roe: roeOf(p),
        debt: debtOf(p),
        sales: p.fundamentals?.sales_growth_3y_cagr ?? null,
        profit: p.fundamentals?.profit_growth_3y_cagr ?? null,
      })),
    },
  ];
}

/** Chapter 5: the one-standard-deviation range; nothing when too little of the book has a price history. */
export function scenarioBlocks(positions: readonly Position[]): ResearchBlock[] {
  const range = scenarioRange(positions);
  if (!range) return [];
  const [bear, base, bull] = range.scenarios;
  const sectors = new Map<string, number>();
  for (const h of range.byHolding) sectors.set(h.sector, (sectors.get(h.sector) ?? 0) + h.moveRs);
  return [
    {
      type: 'kpi_grid',
      items: [
        { label: 'Bear: one volatility down', value: formatRupeesShort(bear.value), note: formatPercent(bear.movePct), tone: 'negative' },
        { label: 'Base: unchanged', value: formatRupeesShort(base.value), note: 'Today’s value' },
        { label: 'Bull: one volatility up', value: formatRupeesShort(bull.value), note: formatPercent(bull.movePct), tone: 'positive' },
        { label: 'Portfolio volatility', value: `${formatNumber(range.volatilityPct)}%`, note: `One year, over ${formatNumber(range.coveragePct)}% of the book` },
      ],
    },
    {
      type: 'bar_chart',
      title: 'Portfolio value across the range',
      unit: '₹',
      orientation: 'vertical',
      categories: range.scenarios.map((s) => s.name),
      series: [{ name: 'Value', values: range.scenarios.map((s) => Math.round(s.value)) }],
    },
    {
      type: 'data_table',
      title: 'Where the swing comes from',
      note: 'Each holding’s own one-year volatility applied to its value. A range of how far the book has tended to swing, not a forecast; it assumes holdings move together, so it is an upper bound.',
      columns: [
        { key: 'sector', label: 'Sector', format: 'text' },
        { key: 'move', label: 'Swing at one volatility (₹)', format: 'rupee' },
      ],
      rows: [...sectors].sort((a, b) => b[1] - a[1]).map(([sector, move]) => ({ sector, move: Math.round(move) })),
    },
  ];
}

/** Chapter 6: the standing weaknesses, each with its severity. */
export function riskBlocks(positions: readonly Position[]): ResearchBlock[] {
  const items = riskRegister(positions);
  return items.length === 0
    ? []
    : [{ type: 'card_grid', title: 'Risk register', columns: 2, numbered: false, cards: items.map((r) => ({ heading: r.heading, text: r.text, tag: r.severity })) }];
}

export const portfolioChapterBlocks = (positions: readonly Position[]) => ({
  pf_health: healthBlocks(positions),
  pf_losers: losersBlocks(positions),
  pf_factors: factorBlocks(positions),
  pf_quality: qualityBlocks(positions),
  pf_scenarios: scenarioBlocks(positions),
  pf_risks: riskBlocks(positions),
});

export { totalValue };
