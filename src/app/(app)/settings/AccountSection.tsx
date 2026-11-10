'use client';

import { useClerk, useSession, useSessionList } from '@clerk/nextjs';
import { useState } from 'react';
import { buildAccountRows, multiSessionState } from '@/lib/auth/accounts';
import styles from './Settings.module.css';

/** Hosted-mode only (needs ClerkProvider, which the app layout supplies). */
export function AccountSection() {
  const clerk = useClerk();
  const { session } = useSession();
  const { sessions, isLoaded } = useSessionList();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `singleSessionMode` is not in Clerk's public typings, so read it defensively; unknown = try and report.
  const environment = (clerk as unknown as { __unstable__environment?: { authConfig?: { singleSessionMode?: unknown } } }).__unstable__environment;
  const multi = multiSessionState(environment?.authConfig?.singleSessionMode);

  const rows = buildAccountRows(sessions ?? [], session?.id ?? null);

  const run = async (key: string, action: () => Promise<unknown> | void) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const addAccount = () =>
    run('add', () => {
      if (multi === 'disabled') throw new Error('Using more than one account on this device is not enabled on this instance yet.');
      clerk.openSignIn({});
    });

  return (
    <section id="account" className={styles.section} aria-labelledby="account-title">
      <h2 id="account-title" className={styles.sectionTitle}>Account &amp; security</h2>
      <p className={styles.sectionIntro}>
        Your sign-in, username, two-factor authentication, passkeys and active devices are managed securely by our sign-in provider. A second account (for example a family member&rsquo;s) is a separate MarketMitra account with its own portfolio, alerts and chats; accounts never share data.
      </p>

      <div className={styles.rows}>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <p className={styles.rowLabel}>Manage account &amp; security</p>
            <p className={styles.rowHint}>Username, email, password, two-factor authentication, passkeys, connected accounts and signed-in devices.</p>
          </div>
          <button type="button" className={styles.btn} disabled={!isLoaded} onClick={() => void run('manage', () => clerk.openUserProfile())}>
            Manage
          </button>
        </div>

        <div className={styles.row}>
          <div className={styles.rowText}>
            <p className={styles.rowLabel}>Accounts on this device</p>
            <p className={styles.rowHint}>
              {multi === 'disabled'
                ? 'This instance allows one signed-in account at a time. Sign out to use a different account.'
                : 'Switch between accounts without signing out, or add another one.'}
            </p>
          </div>
          <button type="button" className={styles.btn} disabled={!isLoaded || busy === 'add'} onClick={() => void addAccount()}>
            Add account
          </button>
        </div>
      </div>

      {isLoaded && rows.length > 0 && (
        <ul className={styles.accountList} aria-label="Signed-in accounts">
          {rows.map((r) => (
            <li key={r.id} className={styles.accountItem}>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote avatar from the auth provider */}
              {r.imageUrl ? <img src={r.imageUrl} alt="" className={styles.avatar} /> : <span className={styles.avatar} aria-hidden="true" />}
              <span className={styles.accountText}>
                <span className={styles.rowLabel}>
                  {r.name} {r.current && <span className={styles.currentTag}>Current</span>}
                </span>
                <span className={styles.rowHint}>{r.identifier}</span>
              </span>
              {!r.current && (
                <button type="button" className={styles.btn} disabled={busy !== null} onClick={() => void run(`switch-${r.id}`, () => clerk.setActive({ session: r.id, redirectUrl: '/dashboard' }))}>
                  Switch
                </button>
              )}
              <button
                type="button"
                className={styles.btnDanger}
                disabled={busy !== null}
                onClick={() => void run(`out-${r.id}`, () => clerk.signOut({ sessionId: r.id, redirectUrl: r.current ? '/' : undefined }))}
              >
                Sign out
              </button>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 1 && (
        <p className={styles.status}>
          <button type="button" className={styles.linkBtn} onClick={() => void run('all', () => clerk.signOut({ redirectUrl: '/' }))}>
            Sign out of all accounts
          </button>
        </p>
      )}
      {error && <p className={`${styles.status} ${styles.error}`} role="alert">{error}</p>}
    </section>
  );
}

/** Self-host has no sign-in: one local user, nothing to sign out of. */
export function LocalAccountSection() {
  return (
    <section id="account" className={styles.section} aria-labelledby="account-title">
      <h2 id="account-title" className={styles.sectionTitle}>Account &amp; security</h2>
      <p className={styles.sectionIntro}>
        This is a self-hosted instance with a single local user, so there is no sign-in, sign-out or account switching. Protect it the way you protect the machine or network it runs on.
      </p>
    </section>
  );
}
