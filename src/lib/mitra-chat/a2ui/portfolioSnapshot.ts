// A portfolio snapshot as an A2UI v1.0 surface (#326, ADR 0077). Built here from the user's own holdings and live
// quotes, never by the model: it picks the tool, we pick every component and every figure. Pure, so it tests without mocks.

import { formatInr } from '@/lib/dashboard/format';
import {
  buildRiskCards,
  holdingReturnPct,
  portfolioTotals,
  type HoldingLike,
} from '@/lib/portfolio/portfolioMetrics';

import { BASIC_CATALOG_ID, UNAVAILABLE, column, divider, row, surfaceMessages, text, type A2uiMessage, type Component } from './kit';

export { BASIC_CATALOG_ID };
export type { A2uiMessage };
export const SNAPSHOT_SURFACE_ID = 'portfolio-snapshot';
const MAX_ROWS = 5;

export interface PortfolioSnapshot {
  /** What the chat renders. */
  readonly messages: readonly A2uiMessage[];
  /** What the model reads instead of the layout: the same figures as text. */
  readonly summary: string;
}

const signedInr = (n: number): string => `${n >= 0 ? '+' : ''}${formatInr(n, 0)}`;
const signedPct = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

const valueOf = (h: HoldingLike): number | null => (h.ltp === null ? null : h.quantity * h.ltp);

function stat(id: string, label: string, value: string): Component[] {
  return [column(id, [`${id}_l`, `${id}_v`]), text(`${id}_l`, label, 'caption'), text(`${id}_v`, value)];
}

/** Null when there is nothing to show (no holdings). */
export function buildPortfolioSnapshot(holdings: readonly HoldingLike[]): PortfolioSnapshot | null {
  if (holdings.length === 0) return null;

  const priced = holdings.filter((h) => h.ltp !== null);
  const totals = portfolioTotals(holdings);
  // P&L only over holdings that have a live price, so an unpriced holding cannot show up as a loss.
  const investedPriced = priced.reduce((sum, h) => sum + h.quantity * h.avgPrice, 0);
  const pl = totals.totalValue - investedPriced;
  const plText = priced.length === 0 ? UNAVAILABLE : `${signedInr(pl)} (${signedPct(investedPriced > 0 ? (pl / investedPriced) * 100 : 0)})`;
  const todayText = priced.length === 0 ? UNAVAILABLE : signedInr(totals.todayChange);
  const valueText = priced.length === 0 ? UNAVAILABLE : formatInr(totals.totalValue, 0);

  const ranked = [...holdings].sort((a, b) => (valueOf(b) ?? -1) - (valueOf(a) ?? -1));
  const shown = ranked.slice(0, MAX_ROWS);
  const rowFor = (h: HoldingLike, i: number): Component[] => {
    const value = valueOf(h);
    const ret = holdingReturnPct(h);
    const weight = value !== null && totals.totalValue > 0 ? `${((value / totals.totalValue) * 100).toFixed(1)}%` : UNAVAILABLE;
    return [
      row(`h${i}`, [`h${i}_s`, `h${i}_w`, `h${i}_r`]),
      text(`h${i}_s`, h.symbol, 'body', 2),
      text(`h${i}_w`, weight, 'caption', 1),
      text(`h${i}_r`, ret === null ? UNAVAILABLE : signedPct(ret), 'body', 1),
    ];
  };

  // "100% in Other" only means the sectors are unknown, so that note is dropped rather than shown as a finding.
  const risks = buildRiskCards(holdings).filter((r) => !(r.id === 'sector' && /allocation in Other across/.test(r.text)));
  const riskRows = risks.flatMap((r, i): Component[] => [column(`k${i}`, [`k${i}_t`, `k${i}_b`]), text(`k${i}_t`, r.title, 'caption'), text(`k${i}_b`, r.text)]);

  const hiddenCount = ranked.length - shown.length;
  const bodyChildren = [
    'title',
    'stats',
    'd1',
    'hold_t',
    ...shown.map((_, i) => `h${i}`),
    ...(hiddenCount > 0 ? ['more'] : []),
    ...(risks.length > 0 ? ['d2', 'risk_t', ...risks.map((_, i) => `k${i}`)] : []),
  ];

  const components: Component[] = [
    { id: 'root', component: 'Card', child: 'body' },
    column('body', bodyChildren),
    text('title', `Portfolio snapshot · ${holdings.length} holding${holdings.length === 1 ? '' : 's'}`),
    row('stats', ['s_value', 's_invested', 's_pl', 's_today']),
    ...stat('s_value', 'Value', valueText),
    ...stat('s_invested', 'Invested', formatInr(holdings.reduce((sum, h) => sum + h.quantity * h.avgPrice, 0), 0)),
    ...stat('s_pl', 'Unrealised P&L', plText),
    ...stat('s_today', 'Today', todayText),
    divider('d1'),
    text('hold_t', 'Biggest holdings · weight · return on cost', 'caption'),
    ...shown.flatMap(rowFor),
    ...(hiddenCount > 0 ? [text('more', `+ ${hiddenCount} more holding${hiddenCount === 1 ? '' : 's'}`, 'caption')] : []),
    ...(risks.length > 0 ? [divider('d2'), text('risk_t', 'Risk notes from your own numbers', 'caption'), ...riskRows] : []),
  ];

  const messages = surfaceMessages(SNAPSHOT_SURFACE_ID, components);

  const unpriced = holdings.length - priced.length;
  const summary = [
    'A portfolio snapshot card was already shown to the user; do not repeat its numbers line by line, interpret them.',
    `Holdings: ${holdings.length}. Value ${valueText}, invested ${formatInr(holdings.reduce((s, h) => s + h.quantity * h.avgPrice, 0), 0)}, unrealised P&L ${plText}, today ${todayText}.`,
    `Biggest: ${shown.map((h) => `${h.symbol} ${(valueOf(h) !== null && totals.totalValue > 0 ? ((valueOf(h)! / totals.totalValue) * 100).toFixed(1) : UNAVAILABLE)}%`).join(', ')}.`,
    ...risks.map((r) => `${r.title}: ${r.text}`),
    ...(unpriced > 0 ? [`${unpriced} of ${holdings.length} holdings have no live price and are left out of value and P&L.`] : []),
  ].join('\n');

  return { messages, summary };
}
