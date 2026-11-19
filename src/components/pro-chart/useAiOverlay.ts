'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartOverlay } from '@/lib/chart/aiOverlay';
import type { OverlayRun } from '@/lib/chart/overlayRuns';
import type { Timeframe } from '@/lib/chart/timeframes';

export type AiOverlayStatus = 'idle' | 'loading' | 'ready' | 'error';

interface RunsResponse {
  readonly success: boolean;
  readonly data?: { readonly runs: OverlayRun[] };
}
interface GenerateResponse {
  readonly success: boolean;
  readonly error?: string;
  readonly data?: { readonly run: OverlayRun; readonly saved?: boolean };
}

interface Saved {
  key: string;
  runs: OverlayRun[];
}

export interface AiOverlayState {
  status: AiOverlayStatus;
  /** What is drawn: the shown run's overlay, possibly with items the user removed since. */
  overlay: ChartOverlay | null;
  error: string | null;
  /** Shown beside the chart, for example when a new run could not be saved. */
  notice: string | null;
  /** The saved runs for this stock and timeframe, newest first. */
  runs: OverlayRun[];
  /** The run being shown. */
  activeId: string | null;
}

const NO_KEY_MESSAGE = 'Add your AI provider key in Settings to use Auto-Chart.';
const NOT_SAVED_NOTICE = 'This Auto-Chart could not be saved, so it will be gone when you leave.';

export interface AiOverlayApi extends AiOverlayState {
  /** Turn Auto-Chart on: the newest saved run when there is one (no AI call), otherwise a newly generated one. */
  enable: () => Promise<ChartOverlay | null>;
  /** Generate a new run and keep the earlier ones. */
  generate: () => Promise<ChartOverlay | null>;
  /** Show one of the saved runs. */
  show: (id: string) => ChartOverlay | null;
  /** Delete a saved run. When it was the one shown, the next newest is shown, or Auto-Chart goes off when none is left. */
  remove: (id: string) => Promise<{ next: ChartOverlay | null; off: boolean }>;
  /** Hide Auto-Chart (the saved runs stay). */
  disable: () => void;
  /** Replace the drawn overlay with an edited copy (an item removed or hidden). */
  update: (next: ChartOverlay) => void;
}

/**
 * Auto-Chart for one stock and timeframe (#228, #253). Every generation is saved on the server, so the chart can be shown again
 * later, several can be kept side by side in the "Saved" list, and old ones deleted. A late reply after the user moved on is ignored.
 */
export function useAiOverlay(symbol: string, timeframe: Timeframe): AiOverlayApi {
  const key = `${symbol}|${timeframe}`;
  const [shown, setShown] = useState<{
    status: AiOverlayStatus;
    overlay: ChartOverlay | null;
    error: string | null;
    notice: string | null;
    activeId: string | null;
    key: string;
  }>({ status: 'idle', overlay: null, error: null, notice: null, activeId: null, key });
  const [saved, setSaved] = useState<Saved>({ key, runs: [] });
  const run = useRef(0);
  // The latest list, for callbacks that must not wait for a re-render.
  const runsRef = useRef<OverlayRun[]>([]);

  const current =
    shown.key === key
      ? shown
      : { status: 'idle' as const, overlay: null, error: null, notice: null, activeId: null, key };
  const runs = useMemo(() => (saved.key === key ? saved.runs : []), [saved, key]);
  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  // The saved runs for this stock and timeframe.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/insights/chart-overlay?symbol=${encodeURIComponent(symbol)}&interval=${timeframe}`)
      .then((res) => res.json() as Promise<RunsResponse>)
      .then((body) => {
        if (!cancelled && body.success && body.data) setSaved({ key, runs: body.data.runs });
      })
      .catch(() => {
        // No saved list is not an error worth showing: Auto-Chart still generates.
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, key]);

  const display = useCallback(
    (r: OverlayRun) => {
      setShown({
        status: 'ready',
        overlay: r.overlay,
        error: null,
        notice: null,
        activeId: r.id || null,
        key,
      });
      return r.overlay;
    },
    [key],
  );

  const generate = useCallback(async (): Promise<ChartOverlay | null> => {
    const id = ++run.current;
    setShown((cur) => ({ ...cur, key, status: 'loading', error: null, notice: null }));
    try {
      const res = await fetch('/api/insights/chart-overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, interval: timeframe }),
      });
      const body = (await res.json().catch(() => null)) as GenerateResponse | null;
      if (id !== run.current) return null;
      if (!res.ok || !body?.success || !body.data) {
        const error =
          body?.error === 'no_ai_key'
            ? NO_KEY_MESSAGE
            : (body?.error ?? 'Auto-Chart could not be drawn. Try again.');
        setShown((cur) => ({ ...cur, key, status: cur.overlay ? 'ready' : 'error', error }));
        return null;
      }
      const newRun = body.data.run;
      if (body.data.saved !== false)
        setSaved((cur) => ({ key, runs: [newRun, ...(cur.key === key ? cur.runs : [])] }));
      setShown({
        status: 'ready',
        overlay: newRun.overlay,
        error: null,
        notice: body.data.saved === false ? NOT_SAVED_NOTICE : null,
        activeId: body.data.saved === false ? null : newRun.id,
        key,
      });
      return newRun.overlay;
    } catch {
      if (id === run.current)
        setShown((cur) => ({
          ...cur,
          key,
          status: cur.overlay ? 'ready' : 'error',
          error: 'Auto-Chart could not be reached. Check your connection and try again.',
        }));
      return null;
    }
  }, [symbol, timeframe, key]);

  const enable = useCallback(async () => {
    const newest = runsRef.current[0];
    return newest ? display(newest) : generate();
  }, [display, generate]);

  const show = useCallback(
    (id: string) => {
      const r = runsRef.current.find((x) => x.id === id);
      return r ? display(r) : null;
    },
    [display],
  );

  const disable = useCallback(() => {
    run.current += 1;
    setShown({ status: 'idle', overlay: null, error: null, notice: null, activeId: null, key });
  }, [key]);

  const remove = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/insights/chart-overlay/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (!res.ok && res.status !== 404) return { next: null, off: false };
      } catch {
        return { next: null, off: false };
      }
      const left = runsRef.current.filter((x) => x.id !== id);
      setSaved({ key, runs: left });
      if (current.activeId !== id) return { next: null, off: false };
      if (left.length > 0) return { next: display(left[0]), off: false };
      disable();
      return { next: null, off: true };
    },
    [key, current.activeId, display, disable],
  );

  const update = useCallback((next: ChartOverlay) => {
    setShown((cur) => (cur.status === 'ready' ? { ...cur, overlay: next } : cur));
  }, []);

  return { ...current, runs, enable, generate, show, remove, disable, update };
}
