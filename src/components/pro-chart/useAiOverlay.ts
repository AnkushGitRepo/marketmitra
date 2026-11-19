'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChartOverlay } from '@/lib/chart/aiOverlay';
import type { PromptMode } from '@/lib/ai/promptMode';
import type { Timeframe } from '@/lib/chart/timeframes';

export type AiOverlayStatus = 'idle' | 'loading' | 'ready' | 'error';

interface OverlayResponse {
  readonly success: boolean;
  readonly error?: string;
  readonly data?: { readonly overlay: ChartOverlay; readonly mode: PromptMode };
}

export interface AiOverlayState {
  status: AiOverlayStatus;
  overlay: ChartOverlay | null;
  mode: PromptMode;
  error: string | null;
}

const IDLE: AiOverlayState = { status: 'idle', overlay: null, mode: 'guarded', error: null };
const NO_KEY_MESSAGE = 'Add your AI provider key in Settings to use Auto-Chart.';

/** Auto-Chart request state (#228). Turning it off clears everything; a late reply after that is ignored. */
export function useAiOverlay(
  symbol: string,
  timeframe: Timeframe,
): AiOverlayState & {
  enable: () => Promise<ChartOverlay | null>;
  disable: () => void;
  /** Replace the drawn overlay with an edited copy (removing one of its items). */
  update: (next: ChartOverlay) => void;
} {
  const [state, setState] = useState<AiOverlayState>(IDLE);
  const run = useRef(0);
  // After an unrestricted answer without a setup, the next attempt skips the 12-hour cache so it can actually differ.
  const retryFresh = useRef(false);

  const enable = useCallback(async (): Promise<ChartOverlay | null> => {
    const id = ++run.current;
    setState({ ...IDLE, status: 'loading' });
    try {
      const res = await fetch('/api/insights/chart-overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, interval: timeframe, force: retryFresh.current }),
      });
      const body = (await res.json().catch(() => null)) as OverlayResponse | null;
      if (id !== run.current) return null;
      if (!res.ok || !body?.success || !body.data) {
        const error =
          body?.error === 'no_ai_key'
            ? NO_KEY_MESSAGE
            : (body?.error ?? 'Auto-Chart could not be drawn. Try again.');
        setState({ ...IDLE, status: 'error', error });
        return null;
      }
      retryFresh.current = body.data.mode === 'unrestricted' && !body.data.overlay.setup;
      setState({ status: 'ready', overlay: body.data.overlay, mode: body.data.mode, error: null });
      return body.data.overlay;
    } catch {
      if (id === run.current)
        setState({
          ...IDLE,
          status: 'error',
          error: 'Auto-Chart could not be reached. Check your connection and try again.',
        });
      return null;
    }
  }, [symbol, timeframe]);

  const disable = useCallback(() => {
    run.current += 1;
    setState(IDLE);
  }, []);

  const update = useCallback((next: ChartOverlay) => {
    setState((cur) => (cur.status === 'ready' ? { ...cur, overlay: next } : cur));
  }, []);

  return { ...state, enable, disable, update };
}
