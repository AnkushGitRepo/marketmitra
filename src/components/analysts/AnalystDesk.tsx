'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { agoLabel, statusView } from '@/lib/analysts/format';
import type { AnalystSource, AnalystStatus, JournalEntry } from '@/lib/analysts/types';
import { DossierReader } from './DossierReader';
import styles from './AnalystDesk.module.css';

export interface RosterAnalyst {
  symbol: string;
  source: AnalystSource;
  status: AnalystStatus;
  statusNote: string | null;
  hasDossier: boolean;
  summary: string | null;
  lastCheckedAt: string | null;
  latest: JournalEntry | null;
}

export interface DeskData {
  auto: boolean;
  usage: { used: number; cap: number };
  analysts: RosterAnalyst[];
}

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
  const [reading, setReading] = useState<string | null>(null);
  // Captured once so server and client render the same relative times.
  const [now] = useState(() => new Date());
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (reading && !d.open) d.showModal();
    if (!reading && d.open) d.close();
  }, [reading]);

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

  const remove = (s: string) => act(`rm-${s}`, () => fetch(`/api/analysts/${s}`, { method: 'DELETE' }), 'Could not remove the analyst.');

  const active = initial.analysts.filter((a) => a.status === 'active').length;
  const { used, cap } = initial.usage;

  return (
    <section className={styles.desk} aria-label="Analyst desk">
      <div className={styles.summary}>
        <div>
          <p className={styles.count}>
            {initial.analysts.length} {initial.analysts.length === 1 ? 'analyst' : 'analysts'} · {active} vigilant
          </p>
          <p className={styles.sub}>
            Each holding gets its own analyst. It checks the stock every evening for free and only uses your AI key when something material happens.
            AI calls today: {used} of {cap}.
          </p>
        </div>
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
        <ul className={styles.roster}>
          {initial.analysts.map((a) => {
            const view = statusView(a.status, a.statusNote);
            return (
              <li key={a.symbol} className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.symbol}>{a.symbol}</span>
                  <span className={styles.source}>{a.source === 'holding' ? 'Holding' : 'Watcher'}</span>
                  <span className={`${styles.status} ${styles[`tone_${view.tone}`]}`}>{view.label}</span>
                  <span className={styles.checked}>Checked {agoLabel(a.lastCheckedAt, now)}</span>
                </div>
                {a.summary && <p className={styles.summaryText}>{a.summary}</p>}
                {a.latest ? (
                  <p className={styles.latest}>
                    <span className={styles.latestLabel}>Latest entry</span> {a.latest.title}
                  </p>
                ) : (
                  <p className={styles.latest}>{a.statusNote ?? 'No journal entries yet.'}</p>
                )}
                <div className={styles.actions}>
                  <button type="button" className={styles.link} onClick={() => setReading(a.symbol)}>
                    Read dossier
                  </button>
                  {a.status === 'paused' || a.status === 'error' ? (
                    <button type="button" className={styles.link} disabled={busy === `status-${a.symbol}`} onClick={() => void setStatus(a.symbol, 'active')}>
                      Resume
                    </button>
                  ) : (
                    <button type="button" className={styles.link} disabled={busy === `status-${a.symbol}`} onClick={() => void setStatus(a.symbol, 'paused')}>
                      Pause
                    </button>
                  )}
                  {a.source === 'watcher' && (
                    <button type="button" className={styles.linkDanger} disabled={busy === `rm-${a.symbol}`} onClick={() => void remove(a.symbol)}>
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <dialog ref={dialog} className={styles.dialog} aria-label="Analyst dossier" onClose={() => setReading(null)} onCancel={() => setReading(null)}>
        {reading && (
          <>
            <div className={styles.dialogHead}>
              <h2 className={styles.dialogTitle}>{reading} · living dossier</h2>
              <button type="button" className={styles.link} onClick={() => setReading(null)}>
                Close
              </button>
            </div>
            <DossierReader symbol={reading} />
          </>
        )}
      </dialog>
    </section>
  );
}
