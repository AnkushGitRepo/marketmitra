// How each compared fund sits against the investor's own portfolio, at sector level only: a fund's own holdings
// are not loaded, so nothing here says anything about individual stocks. Reuses the Fund X-Ray's sector logic. Pure.

import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import { sectorExposure, sectorsForTheme } from './xray';

/** `other`: a fund type we have no sector view of (debt, gold, hybrid, ...), which is said, not guessed at. */
export type FitKind = 'sector' | 'overseas' | 'broad' | 'other';

export interface FundFit {
  readonly code: number;
  readonly kind: FitKind;
  /** The sectors the fund's theme invests in (empty unless `kind` is "sector"). */
  readonly sectors: readonly string[];
  /** Share of the priced portfolio in those sectors; null unless `kind` is "sector". */
  readonly pct: number | null;
}

export interface FitCell {
  readonly text: string;
  readonly detail: string;
}

const joinNames = (names: readonly string[]): string => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * Each fund's fit, in the order given, or null when no weight can be stated at all (no holdings, a failed read,
 * or nothing with a live price): the page then leaves the fit out rather than printing zeros.
 */
export function portfolioFits(
  funds: readonly { readonly scheme_code: number; readonly peer_group: string | null; readonly category: string }[],
  holdings: readonly HoldingLike[] | null,
): FundFit[] | null {
  if (holdings === null || sectorExposure(holdings, []) === null) return null;
  return funds.map((fund): FundFit => {
    const sectors = sectorsForTheme(fund.peer_group);
    if (sectors.length > 0) {
      return { code: fund.scheme_code, kind: 'sector', sectors, pct: sectorExposure(holdings, sectors)?.pct ?? 0 };
    }
    // Only diversified equity funds hold across sectors; debt, gold and the like have no sector view.
    const kind: FitKind = fund.peer_group === 'International' ? 'overseas' : fund.category === 'Equity' ? 'broad' : 'other';
    return { code: fund.scheme_code, kind, sectors: [], pct: null };
  });
}

/** The table cell for a fit: the weight as a fact, no verdict. */
export function fitCell(fit: FundFit): FitCell {
  if (fit.kind === 'overseas') return { text: 'Overseas', detail: 'not Indian stocks' };
  if (fit.kind === 'broad') return { text: 'Spans sectors', detail: '' };
  if (fit.kind === 'other') return { text: 'No sector view', detail: 'for this fund type' };
  const where = `in ${joinNames(fit.sectors)}`;
  return (fit.pct ?? 0) > 0 ? { text: `${(fit.pct as number).toFixed(1)}%`, detail: where } : { text: 'None held', detail: where };
}
