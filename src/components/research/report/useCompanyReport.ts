'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_REPORT, parseNdjson, reduceReport, type ReportState } from '@/lib/research/report/stream';

export type ReportPhase = 'idle' | 'running' | 'finished';

export interface ReportFailure {
  readonly message: string;
  /** The user has not added an AI key. */
  readonly noKey: boolean;
}

const GENERIC = 'Could not generate the report. Try again shortly.';

/**
 * Runs a streamed report and keeps its state as chapters arrive. The company report posts `{ symbol }` to its route; the
 * sector report posts `{ theme }`, the portfolio report `{}`, and the comparison `{ symbols: [...] }`, each to its own route. All stream the
 * same events.
 */
export function useCompanyReport(endpoint = '/api/research/report', field = 'symbol') {
  const [state, setState] = useState<ReportState>(EMPTY_REPORT);
  const [phase, setPhase] = useState<ReportPhase>('idle');
  const [failure, setFailure] = useState<ReportFailure | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const start = useCallback(async (subject: string | readonly string[]) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState(EMPTY_REPORT);
    setFailure(null);
    setPhase('running');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: subject }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        // Refused before streaming: a plain JSON error (no key, unknown company, rate limit).
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setFailure({ message: data?.error === 'no_ai_key' ? '' : (data?.error ?? GENERIC), noKey: data?.error === 'no_ai_key' });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let rest = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const parsed = parseNdjson(rest, decoder.decode(value, { stream: true }));
        rest = parsed.rest;
        if (parsed.events.length > 0) setState((s) => parsed.events.reduce(reduceReport, s));
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') setFailure({ message: GENERIC, noKey: false });
    } finally {
      if (abort.current === controller) setPhase('finished');
    }
  }, [endpoint, field]);

  return { state, phase, failure, start };
}
