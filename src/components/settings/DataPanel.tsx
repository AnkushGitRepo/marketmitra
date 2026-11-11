'use client';

import { useState } from 'react';
import { TypedConfirmDialog } from '@/components/common/TypedConfirmDialog';
import rowStyles from '@/app/(app)/settings/Settings.module.css';
import styles from './DataPanel.module.css';

type Action = 'chats' | 'widget';

const ACTIONS: Record<Action, { label: string; button: string; title: string; hint: string; url: string; done: (data: unknown) => string }> = {
  chats: {
    label: 'Delete all Mitra conversations',
    button: 'Delete all conversations',
    title: 'Delete all Mitra conversations?',
    hint: 'Removes every conversation in the full chat, with its messages and uploaded files.',
    url: '/api/mitra/conversations',
    done: (d) => `Deleted ${(d as { removed?: number } | undefined)?.removed ?? 0} conversation(s).`,
  },
  widget: {
    label: 'Clear the quick-chat widget history',
    button: 'Clear widget history',
    title: 'Clear the quick-chat widget history?',
    hint: 'Clears the floating Mitra widget’s stored questions, which also feed your private search.',
    url: '/api/ai/chat',
    done: () => 'Widget history cleared.',
  },
};

/** Export up front and prominent; irreversible actions fenced off in a Danger Zone, each behind a typed confirmation. */
export function DataPanel() {
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const run = async (action: Action) => {
    const def = ACTIONS[action];
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(def.url, { method: 'DELETE' });
      const body = (await res.json().catch(() => null)) as { data?: unknown; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'That did not work.');
      setMessage({ text: def.done(body?.data), error: false });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'That did not work.', error: true });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <div className={styles.root}>
      <section className={rowStyles.section} aria-labelledby="export-title">
        <h2 id="export-title" className={rowStyles.sectionTitle}>
          Your data
        </h2>
        <p className={rowStyles.sectionIntro}>Your data stays yours. Take a copy any time.</p>
        <div className={styles.exportRow}>
          <div>
            <p className={rowStyles.rowLabel}>Export my data (JSON)</p>
            <p className={rowStyles.rowHint}>
              One file with your holdings, notes, alerts, watchlists, Mitra conversations and preferences. API keys and notification secrets are never included, and chat
              attachments are listed by reference only.
            </p>
          </div>
          <a className={styles.exportBtn} href="/api/settings/export" download>
            Download my data
          </a>
        </div>
      </section>

      <section className={styles.danger} aria-labelledby="danger-title">
        <h2 id="danger-title" className={styles.dangerTitle}>
          Danger zone
        </h2>
        <p className={styles.dangerIntro}>These cannot be undone. Export your data first if you might want it.</p>
        <ul className={styles.dangerList}>
          {(Object.keys(ACTIONS) as Action[]).map((a) => (
            <li key={a} className={styles.dangerItem}>
              <div>
                <p className={styles.dangerLabel}>{ACTIONS[a].label}</p>
                <p className={rowStyles.rowHint}>{ACTIONS[a].hint}</p>
              </div>
              <button type="button" className={styles.dangerBtn} onClick={() => setPending(a)} disabled={busy}>
                {ACTIONS[a].button}
              </button>
            </li>
          ))}
        </ul>
        {message && (
          <p className={`${rowStyles.status} ${message.error ? rowStyles.error : ''}`} role={message.error ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
      </section>

      <TypedConfirmDialog
        open={pending !== null}
        title={pending ? ACTIONS[pending].title : ''}
        confirmLabel={pending ? ACTIONS[pending].button : 'Delete'}
        busy={busy}
        onConfirm={() => pending && void run(pending)}
        onCancel={() => setPending(null)}
      >
        <p>This permanently deletes your data and cannot be undone.</p>
      </TypedConfirmDialog>
    </div>
  );
}
