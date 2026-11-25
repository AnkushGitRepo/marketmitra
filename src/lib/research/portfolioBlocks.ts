import type { ResearchBlock, Tone } from './blocks';
import { formatPercent, formatRupeesShort } from './formatters';

const UNKNOWN_SECTOR = 'Unclassified';
const MAX_SLICES = 8;

export interface HoldingInput {
  readonly symbol: string;
  readonly name: string;
  readonly sector: string | null;
  readonly quantity: number;
  readonly avgPrice: number;
  /** Live price; null when no quote could be fetched. */
  readonly ltp: number | null;
}

interface Position extends HoldingInput {
  readonly invested: number;
  readonly value: number | null;
  readonly pl: number | null;
  readonly plPct: number | null;
}

function toPosition(h: HoldingInput): Position {
  const invested = h.avgPrice * h.quantity;
  const value = h.ltp === null ? null : h.ltp * h.quantity;
  const pl = value === null ? null : value - invested;
  return { ...h, invested, value, pl, plPct: pl === null || invested === 0 ? null : (pl / invested) * 100 };
}

const toneOf = (n: number | null): Tone => (n === null || n === 0 ? 'neutral' : n > 0 ? 'positive' : 'negative');
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** A sector's share of what the holdings are worth now; a holding without a live price counts at what was paid. */
function sectorSlices(positions: readonly Position[]): { label: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const p of positions) {
    const sector = p.sector ?? UNKNOWN_SECTOR;
    totals.set(sector, (totals.get(sector) ?? 0) + (p.value ?? p.invested));
  }
  const sorted = [...totals].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_SLICES) return sorted;
  const rest = sorted.slice(MAX_SLICES - 1);
  return [...sorted.slice(0, MAX_SLICES - 1), { label: 'Other', value: sum(rest.map((s) => s.value)) }];
}

export function portfolioBlocks(holdings: readonly HoldingInput[]): ResearchBlock[] {
  if (holdings.length === 0) return [];
  const positions = holdings.map(toPosition);
  const priced = positions.filter((p) => p.pl !== null);
  const invested = sum(positions.map((p) => p.invested));
  const value = sum(positions.map((p) => p.value ?? p.invested));
  const pl = sum(priced.map((p) => p.pl as number));
  const pricedInvested = sum(priced.map((p) => p.invested));
  const plPct = pricedInvested === 0 ? null : (pl / pricedInvested) * 100;
  const slices = sectorSlices(positions);
  const top = slices[0];
  const byPl = [...priced].sort((a, b) => (b.pl as number) - (a.pl as number));
  const unpriced = positions.length - priced.length;

  return [
    {
      type: 'kpi_grid',
      items: [
        { label: 'Invested', value: formatRupeesShort(invested), note: `${positions.length} holdings` },
        { label: 'Current value', value: formatRupeesShort(value), note: unpriced > 0 ? `${unpriced} without a live price, at cost` : undefined },
        {
          label: 'Net P&L',
          value: formatRupeesShort(pl),
          note: plPct === null ? undefined : formatPercent(plPct),
          tone: toneOf(priced.length === 0 ? null : pl),
        },
        { label: 'Top sector', value: top.label, note: `${formatPercent((top.value / sum(slices.map((s) => s.value))) * 100)} of the portfolio` },
      ],
    },
    { type: 'donut_chart', title: 'Sector allocation', slices },
    ...(byPl.length === 0
      ? []
      : [
          {
            type: 'bar_chart' as const,
            title: 'Unrealised P&L by position',
            unit: '₹',
            orientation: 'horizontal' as const,
            categories: byPl.map((p) => p.symbol),
            series: [{ name: 'P&L', values: byPl.map((p) => Math.round(p.pl as number)) }],
          },
        ]),
    {
      type: 'data_table',
      title: 'Positions',
      columns: [
        { key: 'name', label: 'Holding', format: 'text' },
        { key: 'sector', label: 'Sector', format: 'text' },
        { key: 'invested', label: 'Invested', format: 'rupee' },
        { key: 'value', label: 'Value', format: 'rupee' },
        { key: 'pl', label: 'P&L', format: 'rupee', best: 'high' },
        { key: 'plPct', label: 'P&L %', format: 'percent', best: 'high' },
      ],
      rows: positions.map((p) => ({
        name: `${p.name} (${p.symbol})`,
        sector: p.sector ?? UNKNOWN_SECTOR,
        invested: Math.round(p.invested),
        value: p.value === null ? null : Math.round(p.value),
        pl: p.pl === null ? null : Math.round(p.pl),
        plPct: p.plPct,
      })),
    },
  ];
}
