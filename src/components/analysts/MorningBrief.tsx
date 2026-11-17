'use client';

import { useEffect, useState } from 'react';
import { agoLabel, briefAskPrompt } from '@/lib/analysts/format';
import type { Dispatch } from '@/lib/analysts/dispatch';
import { BriefSections } from './BriefSections';
import styles from './MorningBrief.module.css';

type EmailOutcome = 'sent' | 'skipped' | 'failed';

interface SavedBrief {
  day: string;
  title: string;
  dispatch: Dispatch;
  email: EmailOutcome;
  emailDetail: string | null;
  createdAt: string;
}

interface BriefData {
  latest: SavedBrief | null;
  preview: Dispatch | null;
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: BriefData };

const EMAIL_NOTE: Record<EmailOutcome, string> = { sent: 'Emailed.', skipped: 'Not emailed (email is off or not set up).', failed: 'The email could not be sent.' };

interface MorningBriefProps {
  /** Opens that analyst's chat with the question already in the box. */
  readonly onAsk: (symbol: string, prompt: string) => void;
  readonly onDossier: (symbol: string) => void;
  /** Opens the chat with the Root Agent (the CIO). */
  readonly onDiscuss: () => void;
}

/** Today's morning brief in one view: what the last 24 hours would produce right now, or else the last saved brief. Plus a test email. */
export function MorningBrief({ onAsk, onDossier, onDiscuss }: MorningBriefProps) {
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
  const shown = preview ?? latest?.dispatch ?? null;
  const sameDay = latest !== null && preview !== null && latest.day === preview.day;

  return (
    <div className={styles.root}>
      <p className={styles.banner}>Sent every day at 08:30 AM IST when your analysts logged something material in the last 24 hours. Built from their journals, so it costs no AI calls.</p>
      <section>
        {shown ? (
          <>
            <p className={styles.title}>{shown.title}</p>
            <p className={styles.note}>
              {preview ? `Today · ${preview.day} · the last 24 hours as they stand now.` : `${latest?.day} · ${agoLabel(latest?.createdAt ?? null, now)}. Nothing material in the last 24 hours, so no brief would be sent today.`} {latest && (sameDay || !preview) ? EMAIL_NOTE[latest.email] : ''}
            </p>
            <BriefSections d={shown} onAsk={(symbol, title) => onAsk(symbol, briefAskPrompt(title))} onDossier={onDossier} />
          </>
        ) : (
          <p className={styles.note}>No brief yet. The first one arrives after 08:30 AM IST on a day when an analyst logs something that needs a look or a positive development.</p>
        )}
      </section>
      <div className={styles.footer}>
        <button type="button" className={styles.btn} onClick={onDiscuss}>
          Discuss with the CIO
        </button>
        <button type="button" className={styles.btnGhost} disabled={sending} onClick={() => void sendTest()}>
          {sending ? 'Sending…' : 'Send test email'}
        </button>
        {message && (
          <span className={styles.message} role="status">
            {message}
          </span>
        )}
        <p className={styles.disclaimer}>Not investment advice.</p>
      </div>
    </div>
  );
}
