'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { expiryLabel, lastUsedLabel, scopeLabel } from '@/lib/tokens/display';
import type { ExpiryChoice, TokenScope } from '@/lib/tokens/pat';
import styles from './Settings.module.css';
import tokenStyles from './TokensSection.module.css';

interface TokenRow {
  id: string;
  name: string;
  scope: TokenScope;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  status: 'active' | 'expired' | 'revoked';
}

interface Revealed {
  name: string;
  token: string;
}

const EXPIRY_OPTIONS: ReadonlyArray<{ value: ExpiryChoice; label: string }> = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '365d', label: '1 year' },
  { value: 'never', label: 'No expiry' },
];

const asDate = (s: string | null) => (s ? new Date(s) : null);

/** Hosted-mode only. The token is shown once, at creation, and cannot be retrieved afterwards. */
export function TokensSection() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<TokenScope>('read');
  const [expiry, setExpiry] = useState<ExpiryChoice>('90d');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<TokenRow | null>(null);
  // Captured once so server and client render the same labels.
  const [now] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/tokens', { cache: 'no-store' });
      const json = (await res.json()) as { success: boolean; data?: { tokens: TokenRow[] }; error?: string };
      if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? 'Could not load your tokens');
      setTokens(json.data.tokens);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your tokens');
      setTokens([]);
    }
  }, []);

  useEffect(() => {
    // In a microtask, not synchronously in the effect body (same pattern as SettingsTabs).
    void Promise.resolve().then(load);
  }, [load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scope, expiry }),
      });
      const json = (await res.json()) as { success: boolean; data?: { token: string; name: string }; error?: string };
      if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? 'Could not create the token');
      setRevealed({ name: json.data.name, token: json.data.token });
      setName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the token');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    const target = revoking;
    setRevoking(null);
    setError(null);
    try {
      const res = await fetch(`/api/settings/tokens/${target.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not revoke that token');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke that token');
    }
  };

  const copy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const list = tokens ?? [];

  return (
    <section id="tokens" className={styles.section} aria-labelledby="tokens-title">
      <h2 id="tokens-title" className={styles.sectionTitle}>API access tokens</h2>
      <p className={styles.sectionIntro}>
        For your own scripts, bots and cron jobs: send <code>Authorization: Bearer &lt;token&gt;</code> to the data API. A read-only token can only
        GET; tokens never work on Settings, cron, Advisor or system logs, and they cannot create other tokens. Treat a token like a password. See the{' '}
        <a href="/api-docs">API reference</a>.
      </p>

      {revealed && (
        <div className={tokenStyles.reveal} role="status">
          <p className={styles.rowLabel}>Copy &ldquo;{revealed.name}&rdquo; now. It will not be shown again.</p>
          <code className={tokenStyles.secret}>{revealed.token}</code>
          <div className={tokenStyles.revealActions}>
            <button type="button" className={styles.btn} onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy token'}
            </button>
            <button type="button" className={styles.btn} onClick={() => setRevealed(null)}>
              I have saved it
            </button>
          </div>
        </div>
      )}

      <div className={tokenStyles.form}>
        <input
          className={tokenStyles.input}
          aria-label="Token name"
          placeholder="Name, e.g. nightly script"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select className={styles.select} aria-label="Access" value={scope} onChange={(e) => setScope(e.target.value as TokenScope)}>
          <option value="read">Read only</option>
          <option value="write">Read &amp; write</option>
        </select>
        <select className={styles.select} aria-label="Expiry" value={expiry} onChange={(e) => setExpiry(e.target.value as ExpiryChoice)}>
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" className={styles.btn} disabled={busy || name.trim() === ''} onClick={() => void create()}>
          {busy ? 'Creating…' : 'Create token'}
        </button>
      </div>

      {tokens !== null && list.length === 0 && <p className={styles.status}>No tokens yet.</p>}
      {list.length > 0 && (
        <ul className={tokenStyles.list} aria-label="Your access tokens">
          {list.map((t) => (
            <li key={t.id} className={tokenStyles.item} data-status={t.status}>
              <span className={styles.accountText}>
                <span className={styles.rowLabel}>
                  {t.name} <code className={tokenStyles.prefix}>{t.prefix}…</code>
                </span>
                <span className={styles.rowHint}>
                  {scopeLabel(t.scope)} &middot; {expiryLabel({ expiresAt: asDate(t.expiresAt), status: t.status }, now)} &middot;{' '}
                  {lastUsedLabel(asDate(t.lastUsedAt))}
                </span>
              </span>
              {t.status !== 'revoked' && (
                <button type="button" className={styles.btnDanger} onClick={() => setRevoking(t)}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className={`${styles.status} ${styles.error}`} role="alert">{error}</p>}

      <ConfirmDialog
        open={revoking !== null}
        title="Revoke token?"
        message={revoking ? `"${revoking.name}" stops working immediately. Scripts using it will get 401 errors.` : ''}
        confirmLabel="Revoke token"
        onConfirm={() => void revoke()}
        onCancel={() => setRevoking(null)}
      />
    </section>
  );
}
