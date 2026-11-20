// A two-point read of the comparison, worked out from the table's own winners and the portfolio fit: which fund
// leads the risk and cost measures against which has the highest raw return, and the portfolio's weight in each
// fund's sector. Descriptive only (no buy, sell or "better choice"), quotes only figures the table shows, and
// needs no AI. Pure.

import type { Tone } from '@/lib/ai/briefSpecs';
import { bestByRow, COMPARE_ROWS, RISK_COST_KEYS } from './compare';
import type { FundFit } from './compareFit';
import type { FundSummary } from './types';
import { SECTOR_WATCH_PCT } from './xray';

export interface SummaryItem {
  readonly key: 'tradeoff' | 'fit';
  readonly tone: Tone;
  readonly text: string;
}

const MAX_FIGURES = 3;
/** Fewer measures than this with a clear winner is too thin to say a fund "leads": two of them (Sharpe and Sortino) move together. */
const MIN_CONTESTED = 3;
/** Which of the leader's won measures to quote, most telling first. */
const FIGURE_ORDER = ['sharpe_3y', 'max_drawdown_3y', 'expense_ratio', 'std_dev_3y', 'sortino_3y'] as const;
const FIGURE_LABEL: Readonly<Record<string, string>> = {
  sharpe_3y: 'Sharpe',
  sortino_3y: 'Sortino',
  std_dev_3y: 'volatility',
  max_drawdown_3y: 'worst 3-year fall',
  expense_ratio: 'expense ratio',
};
/** The raw-return measures, tried in order: the first that has a clear winner is used. */
const RAW_RETURNS = [
  { key: 'ret_3y', label: '3-year return' },
  { key: 'ret_1y', label: '1-year return' },
] as const;

const joinNames = (names: readonly string[]): string => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

function tradeoff(funds: readonly FundSummary[]): SummaryItem | null {
  const best = bestByRow(funds);
  const rowOf = (key: string) => COMPARE_ROWS.find((r) => r.key === key);
  const byCode = new Map(funds.map((f) => [f.scheme_code, f]));
  const shown = (key: string, fund: FundSummary): string => rowOf(key)?.render(fund).text ?? '';
  const sentences: string[] = [];

  const contested = RISK_COST_KEYS.filter((key) => best[key] !== null);
  let leaderCode: number | null = null;
  if (contested.length >= MIN_CONTESTED) {
    const wins = new Map<number, number>();
    for (const key of contested) wins.set(best[key] as number, (wins.get(best[key] as number) ?? 0) + 1);
    const ranked = [...wins].sort((a, b) => b[1] - a[1]);
    const unique = ranked.length === 1 || (ranked[0] as [number, number])[1] > (ranked[1] as [number, number])[1];
    if (unique) {
      const [code, count] = ranked[0] as [number, number];
      leaderCode = code;
      const leader = byCode.get(code) as FundSummary;
      const figures = FIGURE_ORDER.filter((key) => best[key] === code)
        .slice(0, MAX_FIGURES)
        .map((key) => `${FIGURE_LABEL[key]} ${shown(key, leader)}`);
      // Counted against all of the measures, so a lead on a few (the rest tied or without figures) is not "all".
      const scope = count === RISK_COST_KEYS.length ? `all ${count}` : `${count} of the ${RISK_COST_KEYS.length}`;
      sentences.push(`${leader.base_name} leads ${scope} risk and cost measures${figures.length > 0 ? ` (${figures.join(', ')})` : ''}.`);
    } else {
      const parts = ranked.map(([code, count]) => `${(byCode.get(code) as FundSummary).base_name} wins ${count}`);
      sentences.push(`The risk and cost measures are split: ${parts.join(', ')}.`);
    }
  }

  const raw = RAW_RETURNS.find((r) => best[r.key] !== null);
  if (raw) {
    const winner = byCode.get(best[raw.key] as number) as FundSummary;
    const value = shown(raw.key, winner);
    if (winner.scheme_code === leaderCode) {
      sentences.push(`It also has the highest ${raw.label} (${value}).`);
    } else {
      const fall = winner.max_drawdown_3y === null ? '' : `, with a worst 3-year fall of ${shown('max_drawdown_3y', winner)}`;
      sentences.push(`${winner.base_name} has the highest ${raw.label} (${value})${fall}.`);
    }
  }
  return sentences.length > 0 ? { key: 'tradeoff', tone: 'neutral', text: sentences.join(' ') } : null;
}

function fitItem(funds: readonly FundSummary[], fits: readonly FundFit[]): SummaryItem | null {
  const byCode = new Map(funds.map((f) => [f.scheme_code, f]));
  // A fund type with no sector view is left out of the sentence: there is nothing true to say about it here.
  const known = fits.flatMap((fit) => (byCode.has(fit.code) && fit.kind !== 'other' ? [{ fit, name: (byCode.get(fit.code) as FundSummary).base_name }] : []));
  if (known.length === 0) return null;
  const sector = known.filter((k) => k.fit.kind === 'sector').sort((a, b) => (b.fit.pct ?? 0) - (a.fit.pct ?? 0));
  const other = known.filter((k) => k.fit.kind !== 'sector');
  const parts = [
    ...sector.map(({ fit, name }) => `${name} ${(fit.pct ?? 0) > 0 ? `${(fit.pct as number).toFixed(1)}%` : 'none'} (${joinNames(fit.sectors)})`),
    ...other.map(({ fit, name }) => (fit.kind === 'overseas' ? `${name} invests overseas` : `${name} holds across sectors`)),
  ];
  const heavy = sector.some((k) => (k.fit.pct ?? 0) >= SECTOR_WATCH_PCT);
  return {
    key: 'fit',
    tone: heavy ? 'warning' : 'neutral',
    text: `Your portfolio weight in the sectors each fund invests in: ${parts.join('; ')}.`,
  };
}

/** The summary points for these funds; `fits` is null when the portfolio gives none (then only the trade-off is returned). */
export function compareSummary(funds: readonly FundSummary[], fits: readonly FundFit[] | null): SummaryItem[] {
  if (funds.length < 2) return [];
  const items = [tradeoff(funds), fits ? fitItem(funds, fits) : null];
  return items.flatMap((item) => (item ? [item] : []));
}
