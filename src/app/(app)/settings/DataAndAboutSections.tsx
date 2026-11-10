'use client';

import Link from 'next/link';
import { useState } from 'react';
import styles from './Settings.module.css';

type Action = 'chats' | 'widget' | null;

export function DataSection() {
  const [confirming, setConfirming] = useState<Action>(null);
  const [busy, setBusy] = useState<Action>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const run = async (action: Exclude<Action, null>, url: string, done: (data: unknown) => string) => {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch(url, { method: 'DELETE' });
      const body = (await res.json().catch(() => null)) as { data?: unknown; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'That did not work.');
      setMessage({ text: done(body?.data), error: false });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'That did not work.', error: true });
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  const confirmButton = (action: Exclude<Action, null>, label: string, url: string, done: (d: unknown) => string) =>
    confirming === action ? (
      <span className={styles.links}>
        <button type="button" className={styles.btnDanger} disabled={busy !== null} onClick={() => void run(action, url, done)}>
          {busy === action ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button type="button" className={styles.btn} onClick={() => setConfirming(null)}>Keep</button>
      </span>
    ) : (
      <button type="button" className={styles.btnDanger} onClick={() => setConfirming(action)}>{label}</button>
    );

  return (
    <section id="data" className={styles.section} aria-labelledby="data-title">
      <h2 id="data-title" className={styles.sectionTitle}>Data and privacy</h2>
      <p className={styles.sectionIntro}>Your data stays yours. Export a copy, or remove your chat history.</p>
      <div className={styles.rows}>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <p className={styles.rowLabel}>Export my data</p>
            <p className={styles.rowHint}>One JSON file with your holdings, notes, alerts, wishlists, Mitra conversations and preferences. API keys and notification secrets are never included, and chat attachments are listed by reference only.</p>
          </div>
          <a className={styles.btnLink} href="/api/settings/export" download>Download</a>
        </div>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <p className={styles.rowLabel}>Delete all Mitra conversations</p>
            <p className={styles.rowHint}>Removes every conversation in the full chat, with its messages and uploaded files. This cannot be undone.</p>
          </div>
          {confirmButton('chats', 'Delete all', '/api/mitra/conversations', (d) => `Deleted ${(d as { removed?: number } | undefined)?.removed ?? 0} conversation(s).`)}
        </div>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <p className={styles.rowLabel}>Clear the quick-chat widget history</p>
            <p className={styles.rowHint}>Clears the floating Mitra widget&rsquo;s stored questions, which also feed your private search.</p>
          </div>
          {confirmButton('widget', 'Clear history', '/api/ai/chat', () => 'Widget history cleared.')}
        </div>
      </div>
      {message && <p className={`${styles.status} ${message.error ? styles.error : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    </section>
  );
}

interface AboutProps {
  readonly hosted: boolean;
  readonly isAdmin: boolean;
}

export function AboutSection({ hosted, isAdmin }: AboutProps) {
  return (
    <section id="about" className={styles.section} aria-labelledby="about-title">
      <h2 id="about-title" className={styles.sectionTitle}>About this instance</h2>
      <dl className={styles.about}>
        <dt>Mode</dt>
        <dd>{hosted ? 'Hosted (sign-in required)' : 'Self-hosted (single local user)'}</dd>
        <dt>Billing</dt>
        <dd>None. MarketMitra is free; AI runs on your own key.</dd>
      </dl>
      <div className={styles.links}>
        <Link className={styles.btnLink} href="/status">System status</Link>
        <Link className={styles.btnLink} href="/api-docs">API reference</Link>
        <Link className={styles.btnLink} href="/privacy">Privacy</Link>
        <Link className={styles.btnLink} href="/terms">Terms</Link>
        {isAdmin && <Link className={styles.btnLink} href="/system">System (admin)</Link>}
      </div>
    </section>
  );
}
