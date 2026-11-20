// Side-by-side fund comparison: which funds are picked, the comparison rows, and which fund
// wins each row. Pure, so it tests without a browser. A tie or a missing figure never wins.

import { formatNumber, formatPercent, returnTone, type Tone } from './format';
import { parseSchemeCode, type FundSummary } from './types';

export const MAX_COMPARE = 3;

export interface CompareItem {
  readonly scheme_code: number;
  readonly name: string;
}

export interface ToggleResult {
  readonly selected: readonly CompareItem[];
  /** True when a fund could not be added because the selection is full. */
  readonly blocked: boolean;
}

export function toggleSelection(selected: readonly CompareItem[], item: CompareItem): ToggleResult {
  if (selected.some((s) => s.scheme_code === item.scheme_code)) {
    return { selected: selected.filter((s) => s.scheme_code !== item.scheme_code), blocked: false };
  }
  if (selected.length >= MAX_COMPARE) return { selected, blocked: true };
  return { selected: [...selected, item], blocked: false };
}

/** Up to three distinct valid scheme codes from `?codes=1,2,3`, in order; anything else is dropped. */
export function parseCompareCodes(raw: string | null): number[] {
  if (!raw) return [];
  const codes: number[] = [];
  for (const part of raw.split(',')) {
    const code = parseSchemeCode(part.trim());
    if (code !== null && !codes.includes(code)) codes.push(code);
    if (codes.length === MAX_COMPARE) break;
  }
  return codes;
}

export function compareHref(codes: readonly number[]): string {
  return `/funds/compare?codes=${codes.join(',')}`;
}

/** A saved selection from storage; untrusted, so anything that is not exactly the shape is ignored. */
export function parseStoredSelection(raw: string | null): CompareItem[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: CompareItem[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) return [];
    const { scheme_code, name } = entry as { scheme_code?: unknown; name?: unknown };
    if (typeof scheme_code !== 'number' || parseSchemeCode(String(scheme_code)) === null || typeof name !== 'string') return [];
    if (!out.some((s) => s.scheme_code === scheme_code)) out.push({ scheme_code, name });
    if (out.length === MAX_COMPARE) break;
  }
  return out;
}

export type CompareGroupId = 'returns' | 'risk' | 'cost';

/** The comparison table reads in three blocks; the fit row at the bottom of the last one is added by the page. */
export const COMPARE_GROUPS: readonly { readonly id: CompareGroupId; readonly title: string }[] = [
  { id: 'returns', title: 'Returns & SIP' },
  { id: 'risk', title: 'Risk-adjusted efficiency' },
  { id: 'cost', title: 'Cost & portfolio fit' },
];

/** The measures that decide a risk-and-cost trade-off, as opposed to a raw return. */
export const RISK_COST_KEYS = ['sharpe_3y', 'sortino_3y', 'std_dev_3y', 'max_drawdown_3y', 'expense_ratio'] as const;

export interface CompareRow {
  readonly key: string;
  readonly group: CompareGroupId;
  readonly label: string;
  /** Which end of the range wins. */
  readonly better: 'higher' | 'lower';
  readonly read: (fund: FundSummary) => number | null;
  readonly render: (fund: FundSummary) => { text: string; tone: Tone };
}

const percentRow = (key: string, group: CompareGroupId, label: string, read: (f: FundSummary) => number | null): CompareRow => ({
  key, group, label, better: 'higher', read,
  render: (f) => ({ text: formatPercent(read(f)), tone: returnTone(read(f)) }),
});

export const COMPARE_ROWS: readonly CompareRow[] = [
  percentRow('ret_1y', 'returns', '1 year return', (f) => f.ret_1y),
  percentRow('ret_3y', 'returns', '3 year return (p.a.)', (f) => f.ret_3y),
  percentRow('ret_5y', 'returns', '5 year return (p.a.)', (f) => f.ret_5y),
  percentRow('sip_xirr_3y', 'returns', '3 year SIP return', (f) => f.sip_xirr_3y),
  percentRow('sip_xirr_5y', 'returns', '5 year SIP return', (f) => f.sip_xirr_5y),
  {
    key: 'sharpe_3y', group: 'risk', label: 'Sharpe ratio', better: 'higher', read: (f) => f.sharpe_3y,
    render: (f) => ({ text: formatNumber(f.sharpe_3y), tone: 'flat' }),
  },
  {
    key: 'sortino_3y', group: 'risk', label: 'Sortino ratio', better: 'higher', read: (f) => f.sortino_3y,
    render: (f) => ({ text: formatNumber(f.sortino_3y), tone: 'flat' }),
  },
  {
    key: 'std_dev_3y', group: 'risk', label: 'Volatility', better: 'lower', read: (f) => f.std_dev_3y,
    render: (f) => ({ text: f.std_dev_3y === null ? formatNumber(null) : `${formatNumber(f.std_dev_3y, 1)}%`, tone: 'flat' }),
  },
  // Drawdowns are negative, so the shallowest fall is the highest number.
  percentRow('max_drawdown_3y', 'risk', 'Worst 3 year fall', (f) => f.max_drawdown_3y),
  {
    key: 'expense_ratio', group: 'cost', label: 'Expense ratio', better: 'lower', read: (f) => f.expense_ratio,
    render: (f) => ({ text: f.expense_ratio === null ? formatNumber(null) : `${formatNumber(f.expense_ratio)}%`, tone: 'flat' }),
  },
];

/** The scheme code that wins `row`, or null when fewer than two funds have a figure or the best is tied. */
export function bestFor(row: CompareRow, funds: readonly FundSummary[]): number | null {
  const known = funds.flatMap((f) => {
    const value = row.read(f);
    return value !== null && Number.isFinite(value) ? [{ code: f.scheme_code, value }] : [];
  });
  if (known.length < 2) return null;
  const best = known.reduce((a, b) => ((row.better === 'higher' ? b.value > a.value : b.value < a.value) ? b : a));
  const leaders = known.filter((k) => k.value === best.value);
  return leaders.length === 1 ? best.code : null;
}

/** The winner of every row, keyed by row key: the shape the compare endpoint returns. */
export function bestByRow(funds: readonly FundSummary[]): Record<string, number | null> {
  return Object.fromEntries(COMPARE_ROWS.map((row) => [row.key, bestFor(row, funds)]));
}
