'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DESK_FILTERS, filterAnalysts, filterCounts, summarizeDesk, tomorrowCount, type DeskData, type DeskFilter } from '@/lib/analysts/desk';
import { AnalystCard } from './AnalystCard';
import { AnalystDrawer, type DrawerPanel } from './AnalystDrawer';
import { RootDeck } from './RootDeck';
import styles from './AnalystDesk.module.css';

const FILTER_LABEL: Record<DeskFilter, string> = { all: 'All', attention: 'Needs attention', vigilant: 'Vigilant', waiting: 'Waiting' };

async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

/** The analyst roster: one analyst per holding, kept up to date in the background with the user's own AI key. */
export function AnalystDesk({ initial }: { readonly initial: DeskData }) {
  const router = useRouter();
  const [auto, setAuto] = useState(initial.auto);
  const [symbol, setSymbol] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<DrawerPanel | null>(null);
  // Captured once so server and client render the same relative times.
  const [now] = useState(() => new Date());
  const [filter, setFilter] = useState<DeskFilter>('all');

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

  const remove = (s: string) => act(`rm-${s}`, () => fetch(`/api/analysts/${s}`, { method: 'DELETE' }), 'Could not remove the analyst.');

  const summary = summarizeDesk(initial.analysts, now);
  const counts = filterCounts(initial.analysts, now);
  const visible = filterAnalysts(initial.analysts, filter, now);

  return (
    <section className={styles.desk} aria-label="Analyst desk">
      <RootDeck summary={summary} now={now} used={initial.usage.used} cap={initial.usage.cap} waitingTomorrow={tomorrowCount(initial.analysts, initial.usage)} onChat={() => setPanel({ kind: 'chat', symbol: null })} onBrief={() => setPanel({ kind: 'brief' })} />

      <div className={styles.autonomy}>
        <p className={styles.autonomyText}>
          Analysts run on their own, with no prompting needed. They use your own AI key, at most {initial.usage.cap} calls a day, and only when something material happens.
        </p>
        <label className={styles.switchRow}>
          <span>Automatic analysts</span>
          <button type="button" role="switch" aria-checked={auto} aria-label="Automatic analysts" className={styles.switch} onClick={() => void toggleAuto()} />
        </label>
      </div>
      {!auto && <p className={styles.off}>Automatic analysts are off: no new analysts are created and none run on a schedule. Your existing journals are kept.</p>}

      <div className={styles.deploy}>
        <input className={styles.input} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Watch another stock, e.g. RELIANCE" aria-label="Symbol to watch" maxLength={20} />
        <button type="button" className={styles.btn} disabled={busy === 'deploy' || symbol.trim() === ''} onClick={() => void deploy()}>
          + Deploy watcher
        </button>
      </div>
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
                <AnalystCard key={a.symbol} analyst={a} all={initial.analysts} usage={initial.usage} now={now} busy={busy} onRead={(sym) => setPanel({ kind: 'dossier', symbol: sym })} onChat={(sym) => setPanel({ kind: 'chat', symbol: sym })} onAnalyze={(sym) => void analyze(sym)} onSetStatus={(s, st) => void setStatus(s, st)} onRemove={(s) => void remove(s)} />
              ))}
            </ul>
          )}
        </>
      )}

      <AnalystDrawer panel={panel} onChange={setPanel} onClose={() => setPanel(null)} />
    </section>
  );
}
