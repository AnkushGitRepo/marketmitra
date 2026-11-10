import type { Ipo, IpoCategory } from './iposApi';

// Filtering, ordering and paging for the IPO tracker. Pure and clock-free —
// "today" is passed in — so it unit-tests without a browser or a network.

/** What the tracker shows an IPO as. The source only knows open / upcoming /
 * closed / listed; "allotted" is derived — closed, and the allotment date has
 * passed, but it hasn't listed yet. */
export type IpoPhase = 'open' | 'upcoming' | 'closed' | 'allotted' | 'listed';
export type IpoTypeFilter = 'all' | IpoCategory;
export type IpoPhaseFilter = 'all' | IpoPhase;

/** In display order. */
export const IPO_PHASES: readonly IpoPhase[] = ['open', 'upcoming', 'closed', 'allotted', 'listed'];

export const PHASE_LABEL: Record<IpoPhase, string> = {
  open: 'Open',
  upcoming: 'Upcoming',
  closed: 'Closed',
  allotted: 'Allotted',
  listed: 'Listed',
};

export const TYPE_LABEL: Record<IpoTypeFilter, string> = {
  all: 'All types',
  mainboard: 'Mainboard',
  sme: 'SME',
};

export const PAGE_SIZES = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;

const IST = 'Asia/Kolkata';

/** Today's civil date in India (YYYY-MM-DD) — IPO calendar dates are IST. */
export function istToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function ipoPhase(ipo: Pick<Ipo, 'status' | 'allotment_date'>, today: string): IpoPhase {
  if (ipo.status === 'closed' && ipo.allotment_date && ipo.allotment_date <= today) return 'allotted';
  return ipo.status;
}

export interface IpoFilters {
  phase: IpoPhaseFilter;
  type: IpoTypeFilter;
}

const phaseRank = (p: IpoPhase) => IPO_PHASES.indexOf(p);

/** Filter, then order by phase (open first); the source's own order is kept within a phase. */
export function filterIpos(ipos: Ipo[], filters: IpoFilters, today: string): Ipo[] {
  return ipos
    .map((ipo, index) => ({ ipo, index, phase: ipoPhase(ipo, today) }))
    .filter(({ ipo, phase }) => (filters.phase === 'all' || phase === filters.phase) && (filters.type === 'all' || ipo.category === filters.type))
    .sort((a, b) => phaseRank(a.phase) - phaseRank(b.phase) || a.index - b.index)
    .map(({ ipo }) => ipo);
}

/** Counts for the phase buttons, given the current type filter. */
export function phaseCounts(ipos: Ipo[], type: IpoTypeFilter, today: string): Record<IpoPhaseFilter, number> {
  const counts: Record<IpoPhaseFilter, number> = { all: 0, open: 0, upcoming: 0, closed: 0, allotted: 0, listed: 0 };
  for (const ipo of ipos) {
    if (type !== 'all' && ipo.category !== type) continue;
    counts.all += 1;
    counts[ipoPhase(ipo, today)] += 1;
  }
  return counts;
}

/** Counts for the type buttons, given the current phase filter. */
export function typeCounts(ipos: Ipo[], phase: IpoPhaseFilter, today: string): Record<IpoTypeFilter, number> {
  const counts: Record<IpoTypeFilter, number> = { all: 0, mainboard: 0, sme: 0 };
  for (const ipo of ipos) {
    if (phase !== 'all' && ipoPhase(ipo, today) !== phase) continue;
    counts.all += 1;
    counts[ipo.category] += 1;
  }
  return counts;
}

export interface Page<T> {
  items: T[];
  /** Zero-based, clamped into range. */
  page: number;
  pageCount: number;
  total: number;
}

export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const clamped = Math.min(Math.max(0, Math.floor(page) || 0), pageCount - 1);
  return { items: items.slice(clamped * size, (clamped + 1) * size), page: clamped, pageCount, total: items.length };
}

export interface IpoQuery extends IpoFilters {
  /** Zero-based. */
  page: number;
  pageSize: number;
}

const isPhase = (v: string | null): v is IpoPhaseFilter => v === 'all' || (!!v && (IPO_PHASES as readonly string[]).includes(v));
const isType = (v: string | null): v is IpoTypeFilter => v === 'all' || v === 'mainboard' || v === 'sme';

/** Read filters from the URL, ignoring anything unrecognised. Pages are 1-based in the URL. */
export function parseIpoQuery(params: { get(name: string): string | null }): IpoQuery {
  const phase = params.get('status');
  const type = params.get('type');
  const size = Number(params.get('size'));
  const page = Number(params.get('page'));
  return {
    phase: isPhase(phase) ? phase : 'all',
    type: isType(type) ? type : 'all',
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    page: Number.isInteger(page) && page >= 1 ? page - 1 : 0,
  };
}

/** The query string for a view — defaults are omitted so the plain page stays a clean URL. */
export function ipoQueryString(q: IpoQuery): string {
  const p = new URLSearchParams();
  if (q.phase !== 'all') p.set('status', q.phase);
  if (q.type !== 'all') p.set('type', q.type);
  if (q.pageSize !== DEFAULT_PAGE_SIZE) p.set('size', String(q.pageSize));
  if (q.page > 0) p.set('page', String(q.page + 1));
  return p.toString();
}
