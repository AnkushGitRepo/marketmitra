// Saved AI Auto-Chart runs (#253): the shape of one, what a reader may see of it, how many are kept, and how it is described in the
// "Saved" menu. Pure. The database access is in `overlayRunsStore.ts`.

import type { PromptMode } from '@/lib/ai/promptMode';
import type { ChartOverlay } from './aiOverlay';
import type { Bar } from './bars';
import { barTimeMs, isIntradayTime, toBarTime, type Timeframe } from './timeframes';

export interface OverlayRun {
  id: string;
  symbol: string;
  interval: Timeframe;
  /** The mode it was generated in. Whether its trade setup may be shown is decided by the reader's mode now, not by this. */
  mode: PromptMode;
  overlay: ChartOverlay;
  model: string;
  /** The last close when it was generated, for "price then". */
  lastClose: number;
  /** ISO time. */
  createdAt: string;
}

/** How many runs are kept per user, stock and timeframe. */
export const MAX_RUNS_PER_VIEW = 10;

/** The run as the caller may see it: a trade setup (and its note) only for a caller who is in unrestricted mode right now (ADR 0068, 0070). */
export function runForMode(run: OverlayRun, callerMode: PromptMode): OverlayRun {
  if (callerMode === 'unrestricted') return run;
  const { setup: _setup, setupNote: _note, ...rest } = run.overlay;
  void _setup;
  void _note;
  return { ...run, overlay: rest };
}

/** From ids listed newest first, the ones beyond the limit (to delete). */
export function idsToPrune(idsNewestFirst: readonly string[]): string[] {
  return idsNewestFirst.slice(MAX_RUNS_PER_VIEW);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function ago(then: Date, now: Date): string {
  const diff = Math.max(0, now.getTime() - then.getTime());
  if (diff < MINUTE_MS) return 'just now';
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (diff < HOUR_MS) return plural(Math.floor(diff / MINUTE_MS), 'minute');
  if (diff < DAY_MS) return plural(Math.floor(diff / HOUR_MS), 'hour');
  return plural(Math.floor(diff / DAY_MS), 'day');
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export interface RunDescription {
  /** `2 days ago`. */
  when: string;
  /** `4 levels · 1 trendline · long setup`. */
  summary: string;
  /** `₹160`. */
  price: string;
}

export function describeRun(run: OverlayRun, now: Date = new Date()): RunDescription {
  const parts: string[] = [];
  if (run.overlay.levels.length > 0) parts.push(count(run.overlay.levels.length, 'level'));
  if (run.overlay.trendlines.length > 0)
    parts.push(count(run.overlay.trendlines.length, 'trendline'));
  if (run.overlay.setup) parts.push(`${run.overlay.setup.direction} setup`);
  return {
    when: ago(new Date(run.createdAt), now),
    summary: parts.join(' · ') || 'nothing drawn',
    price: `₹${run.lastClose.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
  };
}

/** The bar a run was generated on: the last bar that had started by `createdAt`, so its setup box begins there, not at the latest candle. */
export function anchorBarTime(bars: readonly Bar[], createdAt: string): string | null {
  if (bars.length === 0) return null;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return bars[bars.length - 1].time;
  const istMs = Number(toBarTime(created / 1000)) * 1000;
  const key = isIntradayTime(bars[0].time) ? istMs : Math.floor(istMs / 86_400_000) * 86_400_000;
  let anchor = bars[0].time;
  for (const b of bars) if (barTimeMs(b.time) <= key) anchor = b.time;
  return anchor;
}
