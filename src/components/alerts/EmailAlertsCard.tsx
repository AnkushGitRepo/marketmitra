'use client';

import { useState } from 'react';
import type { EmailAlertStatus } from '@/lib/notifications/emailStatus';
import { relativeTime } from '@/app/(app)/alerts/alertText';
import styles from './EmailAlertsCard.module.css';

interface EmailAlertsCardProps {
  readonly initial: EmailAlertStatus | null;
}

type Test = { readonly state: 'idle' | 'sending' } | { readonly state: 'done'; readonly ok: boolean; readonly text: string };

/** The "email me when an alert triggers" switch, whether it can actually send, the last outcome, and a real test email. */
export function EmailAlertsCard({ initial }: EmailAlertsCardProps) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<Test>({ state: 'idle' });

  if (!status) {
    return (
      <section className={styles.card}>
        <h3 className={styles.title}>Email alerts</h3>
        <p className={styles.hint}>Email settings are unavailable right now. Try again in a moment.</p>
      </section>
    );
  }

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/email-alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.enabled }),
      });
      const body = (await res.json().catch(() => null)) as { data?: EmailAlertStatus } | null;
      if (!res.ok || !body?.data) {
        setError('Could not save that. Try again.');
        return;
      }
      setStatus(body.data);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setTest({ state: 'sending' });
    try {
      const res = await fetch('/api/settings/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'email' }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        data?: { result: { status: string; detail?: string }; status: EmailAlertStatus };
      } | null;
      if (!res.ok || !body?.data) {
        setTest({ state: 'done', ok: false, text: body?.error ?? 'Could not send a test email.' });
        return;
      }
      setStatus(body.data.status);
      const ok = body.data.result.status === 'sent';
      setTest({ state: 'done', ok, text: ok ? `Test email sent to ${body.data.status.maskedTo ?? 'your address'}. Check your inbox (and spam).` : `The email provider rejected it: ${body.data.result.detail ?? 'unknown error'}` });
    } catch {
      setTest({ state: 'done', ok: false, text: 'Could not reach the server. Try again.' });
    }
  };

  const blocked = status.blockedBy && status.blockedBy !== 'disabled' ? status.blockedText : null;
  const last = status.last;

  return (
    <section className={styles.card} aria-label="Email alerts">
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>Email alerts</h3>
          <p className={styles.hint}>
            {status.enabled
              ? status.maskedTo
                ? `When an alert triggers we also email ${status.maskedTo}.`
                : 'When an alert triggers we also email your account address.'
              : 'Off: alerts appear in MarketMitra only.'}
          </p>
        </div>
        <label className={styles.switchLabel}>
          <input type="checkbox" checked={status.enabled} disabled={busy} onChange={() => void toggle()} aria-label="Email me when an alert triggers" />
          <span className={styles.track} />
        </label>
      </div>

      {blocked && (
        <p className={styles.warn} role="status">
          {blocked}
        </p>
      )}

      {last && (
        <p className={`${styles.last} ${last.status === 'failed' ? styles.lastFailed : ''}`} role="status">
          Last alert email: {last.status === 'sent' ? 'sent' : last.status === 'failed' ? 'failed' : 'not sent'}{' '}
          {relativeTime(last.at)}
          {last.detail ? `. ${last.detail}` : ''}
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.testBtn} onClick={() => void sendTest()} disabled={test.state === 'sending' || !status.enabled}>
          {test.state === 'sending' ? 'Sending…' : 'Send test email'}
        </button>
        {test.state === 'done' && (
          <span className={test.ok ? styles.ok : styles.bad} role="status">
            {test.text}
          </span>
        )}
      </div>
      {error && (
        <p className={styles.bad} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
