import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import type { Limits } from './profiles';

export type CheckStatus = 'pass' | 'fail' | 'unknown';

export interface FitCheck {
  readonly id: 'exclusion' | 'stock-limit' | 'sector-limit' | 'overlap';
  readonly label: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface FitResult {
  readonly symbol: string;
  readonly checks: readonly FitCheck[];
  readonly breaches: number;
}

export interface FitInput {
  readonly holdings: readonly HoldingLike[];
  readonly symbol: string;
  readonly sector: string | null;
  readonly amountINR: number;
  readonly limits: Limits;
  readonly excludedSectors: readonly string[];
  readonly excludedTickers: readonly string[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const valueOf = (h: HoldingLike) => (h.ltp === null ? 0 : h.quantity * h.ltp);

/** Would adding this amount of one name break the user's own rules? Pure. */
export function checkFit(input: FitInput): FitResult {
  const { holdings, sector, limits } = input;
  const symbol = input.symbol.trim().toUpperCase();
  const amount = Math.max(0, input.amountINR);
  const total = holdings.reduce((sum, h) => sum + valueOf(h), 0);
  const after = total + amount;

  const excluded = input.excludedTickers.some((t) => same(t, symbol)) || (sector !== null && input.excludedSectors.some((s) => same(s, sector)));
  const heldValue = holdings.filter((h) => same(h.symbol, symbol)).reduce((sum, h) => sum + valueOf(h), 0);
  const stockPct = after > 0 ? ((heldValue + amount) / after) * 100 : 0;
  const sectorHeld = sector === null ? [] : holdings.filter((h) => h.sector !== null && same(h.sector, sector));
  const sectorPct = after > 0 ? ((sectorHeld.reduce((sum, h) => sum + valueOf(h), 0) + amount) / after) * 100 : 0;
  const names = new Set(sectorHeld.map((h) => h.symbol.toUpperCase()));
  names.delete(symbol);

  const checks: FitCheck[] = [
    {
      id: 'exclusion',
      label: 'Your exclusions',
      status: excluded ? 'fail' : 'pass',
      detail: excluded ? 'This ticker or its sector is on your exclusion list.' : 'Not on your exclusion list.',
    },
    {
      id: 'stock-limit',
      label: 'Single-stock limit',
      status: stockPct > limits.maxStockPct ? 'fail' : 'pass',
      detail: `It would be ${stockPct.toFixed(1)}% of the portfolio against your ${limits.maxStockPct}% limit.`,
    },
    sector === null
      ? { id: 'sector-limit', label: 'Sector limit', status: 'unknown', detail: 'The sector for this ticker is not known, so the sector limit was not checked.' }
      : {
          id: 'sector-limit',
          label: 'Sector limit',
          status: sectorPct > limits.maxSectorPct ? 'fail' : 'pass',
          detail: `${sector} would be ${sectorPct.toFixed(1)}% of the portfolio against your ${limits.maxSectorPct}% limit.`,
        },
    {
      id: 'overlap',
      label: 'Overlap',
      status: 'pass',
      detail:
        sector === null
          ? 'Sector overlap unknown.'
          : names.size === 0
            ? `You hold no other ${sector} names.`
            : `You already hold ${names.size} ${names.size === 1 ? 'holding' : 'holdings'} in ${sector}.`,
    },
  ];
  return { symbol, checks, breaches: checks.filter((c) => c.status === 'fail').length };
}
