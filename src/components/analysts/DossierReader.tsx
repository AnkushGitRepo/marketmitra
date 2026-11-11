'use client';

import { useEffect, useState } from 'react';
import { agoLabel, kindLabel } from '@/lib/analysts/format';
import type { Dossier, JournalEntry } from '@/lib/analysts/types';
import styles from './DossierReader.module.css';

interface AnalystDetail {
  symbol: string;
  status: string;
  statusNote: string | null;
  dossier: Dossier | null;
  journal: JournalEntry[];
}

type Load = { state: 'loading' } | { state: 'none' } | { state: 'error' } | { state: 'ready'; detail: AnalystDetail };

/** The analyst's living dossier and journal, read-only. Used by the roster modal and the stock page's Agent Journal tab. */
export function DossierReader({ symbol }: { readonly symbol: string }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  // Captured once so server and client render the same relative times.
  const [now] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    // In a microtask, not synchronously in the effect body (same pattern as elsewhere in the app).
    void Promise.resolve()
      .then(() => fetch(`/api/analysts/${encodeURIComponent(symbol)}`, { cache: 'no-store' }))
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setLoad({ state: 'none' });
        const json = (await res.json()) as { success: boolean; data?: AnalystDetail };
        setLoad(res.ok && json.success && json.data ? { state: 'ready', detail: json.data } : { state: 'error' });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (load.state === 'loading') return <p className={styles.note}>Loading the dossier…</p>;
  if (load.state === 'none') return <p className={styles.note}>No analyst is assigned to {symbol} yet. Holdings get one automatically; use Deploy watcher on the Agents page for any other stock.</p>;
  if (load.state === 'error') return <p className={styles.note}>Could not load this analyst right now.</p>;

  const { dossier, journal, statusNote } = load.detail;
  return (
    <div className={styles.root}>
      {!dossier ? (
        <p className={styles.note}>{statusNote ?? 'The dossier is being built. It appears here once the analyst has finished the first review.'}</p>
      ) : (
        <>
          <section>
            <h3 className={styles.h}>Summary</h3>
            <p className={styles.text}>{dossier.summary}</p>
            {dossier.business && <p className={styles.text}>{dossier.business}</p>}
          </section>
          {dossier.strengths.length > 0 && (
            <section>
              <h3 className={styles.h}>What the data supports</h3>
              <ul className={styles.list}>
                {dossier.strengths.map((p) => (
                  <li key={p.title} className={`${styles.pillar} ${styles.good}`}>
                    <strong>{p.title}.</strong> {p.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {dossier.vulnerabilities.length > 0 && (
            <section>
              <h3 className={styles.h}>Where it is weak or thin</h3>
              <ul className={styles.list}>
                {dossier.vulnerabilities.map((p) => (
                  <li key={p.title} className={`${styles.pillar} ${styles.bad}`}>
                    <strong>{p.title}.</strong> {p.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {dossier.notAvailable.length > 0 && <p className={styles.note}>Not assessed (not in our data): {dossier.notAvailable.join(', ')}.</p>}
        </>
      )}

      <section>
        <h3 className={styles.h}>Journal</h3>
        {journal.length === 0 ? (
          <p className={styles.note}>Nothing logged yet. The analyst writes an entry when something material happens: a big price move, a volume spike, new news or a filing, or new results.</p>
        ) : (
          <ol className={styles.journal}>
            {journal.map((e) => (
              <li key={e.id} className={styles.entry} data-alert={e.alert}>
                <div className={styles.entryHead}>
                  <span className={styles.kind}>{kindLabel(e.kind)}</span>
                  {e.impact && <span className={`${styles.impact} ${styles[`impact_${e.impact}`]}`}>{e.impact}</span>}
                  <span className={styles.when}>{agoLabel(e.ts, now)}</span>
                </div>
                <p className={styles.entryTitle}>{e.title}</p>
                {e.body && <p className={styles.text}>{e.body}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className={styles.note}>AI-generated notes from public data, not investment advice.</p>
    </div>
  );
}
