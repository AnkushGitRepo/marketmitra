'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DESK_FILTERS, filterAnalysts, filterCounts, summarizeDesk, tomorrowCount, type DeskData, type DeskFilter } from '@/lib/analysts/desk';
import { AnalystCard } from './AnalystCard';
import { AnalystDrawer, type DrawerPanel } from './AnalystDrawer';
import { RootDeck } from './RootDeck';
import styles from './AnalystDesk.module.css';

const FILTER_LABEL: Record<DeskFilter, string> = { all: 'All', attention: 'Needs attention', vigilant: 'Vigilant', waiting: 'Waiting' };
const REFRESH_MS = 20_000;
const WARM_MS = 3 * 60 * 1000;

async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

/** The analyst roster: one analyst per holding, kept up to date in the background with the user's own AI key. */
export function AnalystDesk({ initial, refreshWhileDue = false }: { readonly initial: DeskData; readonly refreshWhileDue?: boolean }) {
  const router = useRouter();
  const [auto, setAuto] = useState(initial.auto);
  const [symbol, setSymbol] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<DrawerPanel | null>(null);
  // Captured once so server and client render the same relative times.
  const [now] = useState(() => new Date());
  const [filter, setFilter] = useState<DeskFilter>('all');
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!refreshWhileDue) return;
    const initializing = initial.analysts.some((a) => a.status === 'initializing');
    const warming = Date.now() - openedAt < WARM_MS;
    if (!initializing && !warming) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refreshWhileDue, router, initial, openedAt]);

  const act = async (key: string, run: () => Promise<Response>, failure: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await run();
      if (!res.ok) setError(await errorOf(res, failure));
      else router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const toggleAuto = async () => {
    const next = !auto;
    setAuto(next);
    setError(null);
    try {
      const res = await fetch('/api/settings/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agents: { auto: next } }) });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setAuto(!next);
      setError('Could not save that setting.');
    }
  };

  const deploy = () =>
    act('deploy', () => fetch('/api/analysts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol }) }), 'Could not deploy the analyst.').then(() => setSymbol(''));

  const setStatus = (s: string, status: 'active' | 'paused') =>
    act(`status-${s}`, () => fetch(`/api/analysts/${s}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }), 'Could not update the analyst.');

  // Builds the dossier now instead of waiting for the sweep; one model call, so it can take up to a minute.
  const analyze = (s: string) => act(`analyze-${s}`, () => fetch(`/api/analysts/${s}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'analyze' }) }), 'Could not build the dossier.');

  // Re-queues every stalled analyst; the sweep rebuilds them one at a time, so this is instant.
  const retryAll = async () => {
    setBusy('retry-all');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/analysts/retry', { method: 'POST' });
      const json = (await res.json().catch(() => null)) as { data?: { requeued?: number }; error?: string } | null;
      if (!res.ok) setError(json?.error ?? 'Could not re-queue the stalled analysts.');
      else {
        const n = json?.data?.requeued ?? 0;
        setNotice(n === 0 ? 'No stalled analysts to retry.' : `${n} ${n === 1 ? 'analyst' : 'analysts'} re-queued. The next sweep rebuilds them one at a time.`);
        router.refresh();
      }
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const remove = (s: string) => act(`rm-${s}`, () => fetch(`/api/analysts/${s}`, { method: 'DELETE' }), 'Could not remove the analyst.');

  const summary = summarizeDesk(initial.analysts, now);
  const counts = filterCounts(initial.analysts, now);
  const visible = filterAnalysts(initial.analysts, filter, now);

  return (
    <section className={styles.desk} aria-label="Analyst desk">
        <RootDeck summary={summary} now={now} used={initial.usage.used} cap={initial.usage.cap} waitingTomorrow={tomorrowCount(initial.analysts, initial.usage, auto)} busy={busy === 'retry-all'} onRetryAll={() => void retryAll()} onChat={() => setPanel({ kind: 'chat', symbol: null })} onBrief={() => setPanel({ kind: 'brief' })} />

      <div className={styles.autonomy}>
        <p className={styles.autonomyText}>
          Analysts run on their own, with no prompting needed. They use your own AI key, at most {initial.usage.cap} calls a day, and only when something material happens.
        </p>
        <label className={styles.switchRow}>
          <span>Automatic analysts</span>
          <button type="button" role="switch" aria-checked={auto} aria-label="Automatic analysts" className={styles.switch} onClick={() => void toggleAuto()} />
        </label>
      </div>
      {!auto && <p className={styles.off}>Automatic analysts are off, so nothing runs on a schedule. Use Generate dossier on a card to build the one you want. Cards that already have a dossier are unchanged.</p>}

      <div className={styles.deploy}>
        <input className={styles.input} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Watch another stock, e.g. RELIANCE" aria-label="Symbol to watch" maxLength={20} />
        <button type="button" className={styles.btn} disabled={busy === 'deploy' || symbol.trim() === ''} onClick={() => void deploy()}>
          + Deploy watcher
        </button>
      </div>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {initial.analysts.length === 0 ? (
        <p className={styles.empty}>No analysts yet. Add a holding on the Portfolio page and its analyst appears here, or deploy a watcher for any other stock.</p>
      ) : (
        <>
          <div className={styles.filters} role="group" aria-label="Filter analysts">
            {DESK_FILTERS.map((f) => (
              <button key={f} type="button" className={styles.chip} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {FILTER_LABEL[f]} <span className={styles.chipCount}>{counts[f]}</span>
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className={styles.empty}>No analysts match this filter.</p>
          ) : (
            <ul className={styles.roster}>
              {visible.map((a) => (
                <AnalystCard key={a.symbol} analyst={a} all={initial.analysts} usage={initial.usage} now={now} busy={busy} auto={auto} onRead={(sym) => setPanel({ kind: 'dossier', symbol: sym })} onChat={(sym) => setPanel({ kind: 'chat', symbol: sym })} onAnalyze={(sym) => void analyze(sym)} onSetStatus={(s, st) => void setStatus(s, st)} onRemove={(s) => void remove(s)} />
              ))}
            </ul>
          )}
        </>
      )}

      <AnalystDrawer panel={panel} onChange={setPanel} onClose={() => setPanel(null)} />
    </section>
  );
}
