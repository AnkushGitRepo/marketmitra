import type { Ipo, IpoCategory } from './iposApi';

// Filtering, ordering and paging for the IPO tracker. Pure and clock-free —
// "today" is passed in — so it unit-tests without a browser or a network.

/** What the tracker shows an IPO as. The source only knows open / upcoming /
 * closed / listed; "allotted" is derived — closed, and the allotment date has
 * passed, but it hasn't listed yet. */
export type IpoPhase = 'open' | 'upcoming' | 'closed' | 'allotted' | 'listed';
/** The three tabs: issues you can still act on, issues waiting to list, and issues that have listed. */
export type IpoGroup = 'live' | 'closed' | 'listed';
export type IpoTypeFilter = 'all' | IpoCategory;

/** In display order. */
export const IPO_GROUPS: readonly IpoGroup[] = ['live', 'closed', 'listed'];

export const GROUP_LABEL: Record<IpoGroup, string> = {
  live: 'Live & Upcoming',
  closed: 'Closed',
  listed: 'Recently listed',
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

/** The source can lag a refresh, so the dates decide when they disagree with its status: an open or upcoming issue past
 * its close date is closed, and an upcoming one inside its bidding window is open. */
export function ipoPhase(
  ipo: Pick<Ipo, 'status' | 'allotment_date'> & { open_date?: string | null; close_date?: string | null },
  today: string
): IpoPhase {
  let status: Ipo['status'] = ipo.status;
  if ((status === 'open' || status === 'upcoming') && ipo.close_date && ipo.close_date < today) status = 'closed';
  else if (status === 'upcoming' && ipo.open_date && ipo.close_date && ipo.open_date <= today) status = 'open';
  if (status === 'closed' && ipo.allotment_date && ipo.allotment_date <= today) return 'allotted';
  return status;
}

export function groupOf(phase: IpoPhase): IpoGroup {
  if (phase === 'open' || phase === 'upcoming') return 'live';
  return phase === 'listed' ? 'listed' : 'closed';
}

const groupOfIpo = (ipo: Ipo, today: string): IpoGroup => groupOf(ipoPhase(ipo, today));

/** Ascending ISO-date compare with missing dates last. */
const byDate = (a: string | null, b: string | null, dir: 1 | -1 = 1): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -dir : dir;
};

/** Live issues first (open ones, closing soonest, then upcoming by opening date); closed and listed newest first. */
function compareWithin(group: IpoGroup, a: Ipo, b: Ipo): number {
  if (group === 'live') {
    const openFirst = Number(b.status === 'open') - Number(a.status === 'open');
    return openFirst || (a.status === 'open' ? byDate(a.close_date, b.close_date) : byDate(a.open_date, b.open_date));
  }
  return group === 'listed' ? byDate(a.listing_date, b.listing_date, -1) : byDate(a.close_date, b.close_date, -1);
}

export interface IpoFilters {
  group: IpoGroup;
  type: IpoTypeFilter;
}

export function filterIpos(ipos: readonly Ipo[], filters: IpoFilters, today: string): Ipo[] {
  return ipos
    .map((ipo, index) => ({ ipo, index }))
    .filter(({ ipo }) => groupOfIpo(ipo, today) === filters.group && (filters.type === 'all' || ipo.category === filters.type))
    .sort((a, b) => compareWithin(filters.group, a.ipo, b.ipo) || a.index - b.index)
    .map(({ ipo }) => ipo);
}

/** Counts for the lifecycle tabs, given the current type filter. */
export function groupCounts(ipos: readonly Ipo[], type: IpoTypeFilter, today: string): Record<IpoGroup, number> {
  const counts: Record<IpoGroup, number> = { live: 0, closed: 0, listed: 0 };
  for (const ipo of ipos) {
    if (type !== 'all' && ipo.category !== type) continue;
    counts[groupOfIpo(ipo, today)] += 1;
  }
  return counts;
}

/** Counts for the type control, given the current tab. */
export function typeCounts(ipos: readonly Ipo[], group: IpoGroup, today: string): Record<IpoTypeFilter, number> {
  const counts: Record<IpoTypeFilter, number> = { all: 0, mainboard: 0, sme: 0 };
  for (const ipo of ipos) {
    if (groupOfIpo(ipo, today) !== group) continue;
    counts.all += 1;
    counts[ipo.category] += 1;
  }
  return counts;
}

/** Tabs worth showing: those with IPOs, plus the active one so the view never silently changes. */
export function visibleGroups(counts: Record<IpoGroup, number>, active: IpoGroup): IpoGroup[] {
  return IPO_GROUPS.filter((g) => counts[g] > 0 || g === active);
}

/** The tab to open on: the first with anything in it, so the page is never an empty "Live" list when issues exist elsewhere. */
export function defaultGroup(counts: Record<IpoGroup, number>): IpoGroup {
  return IPO_GROUPS.find((g) => counts[g] > 0) ?? 'live';
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

export interface IpoQuery {
  /** null = not chosen: open on the first tab that has IPOs. */
  group: IpoGroup | null;
  type: IpoTypeFilter;
  /** Zero-based. */
  page: number;
  pageSize: number;
}

const isGroup = (v: string | null): v is IpoGroup => v === 'live' || v === 'closed' || v === 'listed';
const isType = (v: string | null): v is IpoTypeFilter => v === 'all' || v === 'mainboard' || v === 'sme';

/** Links from before the tabs were merged used `?status=`; they still land on the right tab. */
const LEGACY_STATUS: Record<string, IpoGroup> = { open: 'live', upcoming: 'live', closed: 'closed', allotted: 'closed', listed: 'listed' };

/** Read the view from the URL, ignoring anything unrecognised. Pages are 1-based in the URL. */
export function parseIpoQuery(params: { get(name: string): string | null }): IpoQuery {
  const group = params.get('group');
  const status = params.get('status');
  const type = params.get('type');
  const size = Number(params.get('size'));
  const page = Number(params.get('page'));
  return {
    group: isGroup(group) ? group : status ? (LEGACY_STATUS[status] ?? null) : null,
    type: isType(type) ? type : 'all',
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    page: Number.isInteger(page) && page >= 1 ? page - 1 : 0,
  };
}

/** The query string for a view — defaults are omitted so the plain page stays a clean URL. */
export function ipoQueryString(q: IpoQuery): string {
  const p = new URLSearchParams();
  if (q.group) p.set('group', q.group);
  if (q.type !== 'all') p.set('type', q.type);
  if (q.pageSize !== DEFAULT_PAGE_SIZE) p.set('size', String(q.pageSize));
  if (q.page > 0) p.set('page', String(q.page + 1));
  return p.toString();
}
