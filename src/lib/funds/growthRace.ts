// The normalized growth race: every compared fund indexed to ₹10,000 on the same start date, so how each got
// to its figure (smooth compounding or a rollercoaster) is visible. Pure, plain SVG geometry, no chart library.
// It never extrapolates: a fund younger than the window makes the window unavailable, and says which fund.

import { adjustForUnitChanges } from './sip';
import type { NavPoint } from './types';

export const RACE_BASE = 10_000;

/** The windows, with the number of days the NAV endpoint's matching range covers. */
export const RACE_WINDOWS = [
  { id: '1y', label: '1Y', days: 365 },
  { id: '3y', label: '3Y', days: 1096 },
  { id: '5y', label: '5Y', days: 1826 },
] as const;
export type RaceWindowId = (typeof RACE_WINDOWS)[number]['id'];

const DAY_MS = 86_400_000;
/** A fund whose history starts this close to the window's start still counts as covering it. */
const GRACE_DAYS = 7;
const DEFAULT_MAX_POINTS = 160;

export interface RaceInput {
  readonly code: number;
  readonly name: string;
  readonly series: readonly NavPoint[];
}

export interface RacePoint {
  readonly date: string;
  readonly value: number;
}

export interface RaceLine {
  readonly code: number;
  readonly name: string;
  readonly points: readonly RacePoint[];
  /** What ₹10,000 became at the end of the window. */
  readonly final: number;
  readonly changePct: number;
}

export type RaceReady = { readonly ok: true; readonly start: string; readonly end: string; readonly lines: readonly RaceLine[] };
export type RaceResult = RaceReady | { readonly ok: false; readonly reason: 'too_young' | 'no_data'; readonly names: readonly string[] };

const toMs = (iso: string): number => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** NAV of the last point on or before `iso`, or null. */
function navOnOrBefore(series: readonly NavPoint[], iso: string): number | null {
  let found: number | null = null;
  for (const point of series) {
    if (point.date.slice(0, 10) > iso) break;
    found = point.nav;
  }
  return found;
}

function thin<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max || max < 2) return [...items];
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)] as T);
}

export function buildRace(inputs: readonly RaceInput[], days: number, maxPoints: number = DEFAULT_MAX_POINTS): RaceResult {
  const empty = inputs.filter((i) => i.series.length < 2).map((i) => i.name);
  if (empty.length > 0) return { ok: false, reason: 'no_data', names: empty };

  // A unit split is no return, the same as everywhere else on the fund pages. The series is sorted first: it comes from the
  // network and is not guaranteed to be in date order.
  const funds = inputs.map((i) => ({ ...i, series: adjustForUnitChanges([...i.series].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) }));
  const end = funds.map((f) => (f.series[f.series.length - 1] as NavPoint).date.slice(0, 10)).reduce((a, b) => (a < b ? a : b));
  const startMs = toMs(end) - days * DAY_MS;
  const start = toIso(startMs);

  const young = funds.filter((f) => toMs((f.series[0] as NavPoint).date) > startMs + GRACE_DAYS * DAY_MS).map((f) => f.name);
  if (young.length > 0) return { ok: false, reason: 'too_young', names: young };

  const lines = funds.map((fund): RaceLine => {
    const upToEnd = fund.series.filter((p) => p.date.slice(0, 10) <= end);
    const startNav = navOnOrBefore(upToEnd, start) ?? (upToEnd[0] as NavPoint).nav;
    const after = upToEnd.filter((p) => p.date.slice(0, 10) > start).map((p): RacePoint => ({ date: p.date.slice(0, 10), value: (RACE_BASE * p.nav) / startNav }));
    const points = thin([{ date: start, value: RACE_BASE }, ...after], maxPoints);
    const final = (points[points.length - 1] as RacePoint).value;
    return { code: fund.code, name: fund.name, points, final, changePct: (final / RACE_BASE - 1) * 100 };
  });
  return { ok: true, start, end, lines };
}

export interface RaceChart {
  readonly paths: readonly { readonly code: number; readonly d: string }[];
  /** The lowest and highest value drawn (₹10,000 is always inside the range). */
  readonly min: number;
  readonly max: number;
  /** Where the ₹10,000 starting line sits. */
  readonly baseY: number;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** `padLeft` is a wider left margin for the amount labels, so a label never sits on a line. */
export function buildRaceChart(race: RaceReady, width: number, height: number, pad: number, padLeft: number = pad): RaceChart {
  const values = race.lines.flatMap((l) => l.points.map((p) => p.value));
  const min = Math.min(RACE_BASE, ...values);
  const max = Math.max(RACE_BASE, ...values);
  const startMs = toMs(race.start);
  const spanMs = Math.max(1, toMs(race.end) - startMs);
  const innerW = width - padLeft - pad;
  const innerH = height - pad * 2;
  const xOf = (date: string): number => padLeft + ((toMs(date) - startMs) / spanMs) * innerW;
  const yOf = (value: number): number => (max === min ? height / 2 : pad + (1 - (value - min) / (max - min)) * innerH);

  const paths = race.lines.map((line) => ({
    code: line.code,
    d: line.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(xOf(p.date))},${round(yOf(p.value))}`).join(' '),
  }));
  return { paths, min, max, baseY: round(yOf(RACE_BASE)) };
}
