'use client';

import { useEffect, useState } from 'react';
import { agoLabel, kindLabel } from '@/lib/analysts/format';
import type { Dispatch, DispatchItem } from '@/lib/analysts/dispatch';
import styles from './MorningBrief.module.css';

interface SavedBrief {
  day: string;
  title: string;
  dispatch: Dispatch;
  email: 'sent' | 'skipped' | 'failed';
  emailDetail: string | null;
  createdAt: string;
}

interface BriefData {
  latest: SavedBrief | null;
  preview: Dispatch | null;
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: BriefData };

const EMAIL_NOTE: Record<SavedBrief['email'], string> = { sent: 'Emailed.', skipped: 'Not emailed (email is off or not set up).', failed: 'The email could not be sent.' };

function Items({ heading, items }: { readonly heading: string; readonly items: readonly DispatchItem[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className={styles.h}>{heading}</h3>
      <ul className={styles.list}>
        {items.map((i, n) => (
          <li key={`${i.symbol}-${n}`} className={styles.item} data-alert={i.alert}>
            <strong>{i.symbol}</strong> <span className={styles.kind}>{kindLabel(i.kind)}</span> {i.title}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DispatchView({ d }: { readonly d: Dispatch }) {
  return (
    <div className={styles.view}>
      <Items heading="Priority" items={d.priority} />
      <Items heading="Overnight developments" items={d.developments} />
      {d.highlights.length > 0 && (
        <section>
          <h3 className={styles.h}>Where each analyst stands</h3>
          <ul className={styles.list}>
            {d.highlights.map((h) => (
              <li key={h.symbol} className={styles.item}>
                <strong>{h.symbol}</strong> {h.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The saved morning briefs: the latest one, what today's would contain right now, and a test email. */
export function MorningBrief() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Captured once so server and client render the same relative times.
  const [now] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(() => fetch('/api/analysts/dispatch', { cache: 'no-store' }))
      .then(async (res) => {
        const json = (await res.json()) as { success: boolean; data?: BriefData };
        if (!cancelled) setLoad(res.ok && json.success && json.data ? { state: 'ready', data: json.data } : { state: 'error' });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sendTest = async () => {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/analysts/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test' }) });
      const json = (await res.json().catch(() => null)) as { data?: { message?: string }; error?: string } | null;
      setMessage(json?.data?.message ?? json?.error ?? 'Could not send the test.');
    } catch {
      setMessage('Could not reach the server. Try again.');
    } finally {
      setSending(false);
    }
  };

  if (load.state === 'loading') return <p className={styles.note}>Loading the morning brief…</p>;
  if (load.state === 'error') return <p className={styles.note}>Could not load the morning brief right now.</p>;
  const { latest, preview } = load.data;

  return (
    <div className={styles.root}>
      <p className={styles.banner}>Sent every day at 08:30 AM IST when your analysts logged something material in the last 24 hours. Built from their journals, so it costs no AI calls.</p>
      <section>
        <h3 className={styles.h}>Latest brief</h3>
        {latest ? (
          <>
            <p className={styles.title}>{latest.title}</p>
            <p className={styles.note}>
              {latest.day} · {agoLabel(latest.createdAt, now)} · {EMAIL_NOTE[latest.email]}
            </p>
            <DispatchView d={latest.dispatch} />
          </>
        ) : (
          <p className={styles.note}>No brief has been sent yet. The first one arrives after 08:30 AM IST on a day with something material to report.</p>
        )}
      </section>
      <section>
        <h3 className={styles.h}>Today’s dispatch so far</h3>
        {preview ? <DispatchView d={preview} /> : <p className={styles.note}>Nothing material in the last 24 hours, so no brief would be sent today.</p>}
      </section>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} disabled={sending} onClick={() => void sendTest()}>
          {sending ? 'Sending…' : 'Send test email'}
        </button>
        {message && (
          <span className={styles.message} role="status">
            {message}
          </span>
        )}
      </div>
      <p className={styles.note}>Not investment advice.</p>
    </div>
  );
}
