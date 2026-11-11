'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { MODEL_OPTIONS, PROVIDER_LABELS } from '@/lib/ai/providers';
import type { Preferences, PreferencesPatch } from '@/lib/preferences/schema';
import type { AiProvider, AiSettingsView } from '@/lib/userSettings';
import rowStyles from '@/app/(app)/settings/Settings.module.css';
import styles from './AiPanel.module.css';

const PROVIDERS: AiProvider[] = ['gemini', 'anthropic', 'openrouter'];

const KEY_HINTS: Record<AiProvider, string> = {
  gemini: 'From aistudio.google.com/apikey, with a generous free tier.',
  anthropic: 'From console.anthropic.com. Starts "sk-ant-".',
  openrouter: 'From openrouter.ai/keys. Routes to many models.',
};

type Test = { readonly state: 'idle' | 'running' } | { readonly state: 'ok'; readonly latencyMs: number } | { readonly state: 'fail'; readonly text: string };

interface AiPanelProps {
  readonly initialView: AiSettingsView | null;
  readonly encConfigured: boolean;
  readonly prefs: Preferences;
  readonly onPrefs: (patch: PreferencesPatch) => void;
  /** Unrestricted Mitra (ADR 0054) exists only on a local / self-host instance. */
  readonly hosted: boolean;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={rowStyles.switch} onClick={() => onChange(!checked)} />;
}

export function AiPanel({ initialView, encConfigured, prefs, onPrefs, hosted }: AiPanelProps) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [confirmingUnrestricted, setConfirmingUnrestricted] = useState(false);
  const [changing, setChanging] = useState(initialView === null);
  const [provider, setProvider] = useState<AiProvider>(initialView?.provider ?? 'gemini');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(initialView?.model ?? '');
  const known = MODEL_OPTIONS[provider].some((o) => o.value === (initialView?.model ?? ''));
  const [modelChoice, setModelChoice] = useState(initialView?.model ? (known ? initialView.model : '__custom__') : '');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<Test>({ state: 'idle' });
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = async () => {
    setError(null);
    if (apiKey.trim().length < 10) {
      setError('Paste your provider API key.');
      return;
    }
    setBusy('save');
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), model: model.trim() || undefined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'Could not save the key.');
        return;
      }
      setView(body.data);
      setApiKey('');
      setChanging(false);
      setTest({ state: 'idle' });
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setConfirmRemove(false);
    setBusy('delete');
    try {
      const res = await fetch('/api/settings/ai', { method: 'DELETE' });
      if (!res.ok) {
        setError('Could not remove the key. Try again.');
        return;
      }
      setView(null);
      setChanging(true);
      setApiKey('');
      setModel('');
      setModelChoice('');
      setTest({ state: 'idle' });
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const runTest = async () => {
    setTest({ state: 'running' });
    try {
      const res = await fetch('/api/settings/ai/test', { method: 'POST' });
      const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string; data?: { latencyMs?: number } } | null;
      if (res.ok && body?.success && typeof body.data?.latencyMs === 'number') setTest({ state: 'ok', latencyMs: body.data.latencyMs });
      else setTest({ state: 'fail', text: body?.error === 'no_ai_key' ? 'No key is stored yet.' : (body?.error ?? 'The test failed.') });
    } catch {
      setTest({ state: 'fail', text: 'Could not reach the server. Try again.' });
    }
  };

  return (
    <div className={styles.root}>
      <section className={styles.card} aria-label="AI connection">
        <div className={styles.status}>
          <span className={`${styles.badge} ${view ? styles.badgeOn : styles.badgeOff}`}>{view ? '● Connected' : '○ Not connected'}</span>
          {view ? (
            <p className={styles.statusText}>
              {PROVIDER_LABELS[view.provider]} · {view.model ? view.model : 'default model'} · key <code>••••{view.keyHint}</code>
            </p>
          ) : (
            <p className={styles.statusText}>Add your own provider key to use Mitra, insights and briefs. MarketMitra charges nothing for AI.</p>
          )}
        </div>

        <p className={styles.trust}>
          <span aria-hidden="true">🔒</span> Your key is encrypted at rest (AES-256-GCM) and used only on the server. After you save it, only its last four characters are
          ever shown again.
        </p>

        {!encConfigured && (
          <p className={styles.warn}>
            This deployment has no <code>SETTINGS_ENC_KEY</code>, so a key can&rsquo;t be stored here. Set <code>AI_PROVIDER</code> / <code>AI_API_KEY</code> as environment
            variables instead.
          </p>
        )}

        {view && (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => void runTest()} disabled={test.state === 'running'}>
              {test.state === 'running' ? 'Testing…' : 'Test connection'}
            </button>
            <button type="button" className={styles.secondary} onClick={() => setChanging((c) => !c)}>
              {changing ? 'Cancel change' : 'Change key'}
            </button>
            <button type="button" className={styles.danger} onClick={() => setConfirmRemove(true)} disabled={busy !== null}>
              {busy === 'delete' ? 'Removing…' : 'Remove key'}
            </button>
          </div>
        )}

        {test.state === 'ok' && (
          <p className={styles.ok} role="status">
            ✓ Connection successful · {test.latencyMs} ms
          </p>
        )}
        {test.state === 'fail' && (
          <p className={styles.bad} role="alert">
            ✕ {test.text}
          </p>
        )}

        {changing && (
          <div className={styles.form}>
            <label className={styles.field}>
              <span className={styles.label}>Provider</span>
              <select
                className={styles.input}
                value={provider}
                onChange={(e) => {
                  // A model ID from one provider is meaningless for another: reset rather than submit a mismatch.
                  setProvider(e.target.value as AiProvider);
                  setModelChoice('');
                  setModel('');
                }}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
              <span className={styles.hint}>{KEY_HINTS[provider]}</span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>API key</span>
              <input className={styles.input} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={view ? 'Paste the new key' : 'Paste your key'} />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Model</span>
              <select
                className={styles.input}
                value={modelChoice}
                onChange={(e) => {
                  const next = e.target.value;
                  setModelChoice(next);
                  setModel(next === '__custom__' ? model : next);
                }}
              >
                {MODEL_OPTIONS[provider].map((opt) => (
                  <option key={opt.value || 'default'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                <option value="__custom__">Other (enter a model ID manually)</option>
              </select>
              {modelChoice === '__custom__' && <input className={styles.input} value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. gemini-3.8-flash" />}
            </label>

            {error && (
              <p className={styles.bad} role="alert">
                {error}
              </p>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={() => void save()} disabled={busy !== null || !encConfigured}>
                {busy === 'save' ? 'Testing key…' : 'Test & save'}
              </button>
            </div>
          </div>
        )}
        {!changing && error && (
          <p className={styles.bad} role="alert">
            {error}
          </p>
        )}
      </section>

      <section className={styles.card} aria-label="What Mitra can do">
        <h3 className={styles.cardTitle}>Mitra permissions</h3>
        <div className={rowStyles.rows}>
          <div className={rowStyles.row}>
            <div className={rowStyles.rowText}>
              <p className={rowStyles.rowLabel}>Let Mitra read my platform data</p>
              <p className={rowStyles.rowHint}>Lets Mitra fetch your holdings, alerts, notes, news and stock data to ground its answers. Read-only. Turn off to make it answer without looking anything up.</p>
            </div>
            <Switch label="Let Mitra read my platform data" checked={prefs.chat.platformAccess} onChange={(v) => onPrefs({ chat: { platformAccess: v } })} />
          </div>
          <div className={rowStyles.row}>
            <div className={rowStyles.rowText}>
              <p className={rowStyles.rowLabel}>Show tool activity</p>
              <p className={rowStyles.rowHint}>Small chips like &ldquo;Ran the screener&rdquo; under a reply, showing what Mitra looked up.</p>
            </div>
            <Switch label="Show tool activity" checked={prefs.chat.showToolActivity} onChange={(v) => onPrefs({ chat: { showToolActivity: v } })} />
          </div>
          {!hosted && (
            <div className={rowStyles.row}>
              <div className={rowStyles.rowText}>
                <p className={rowStyles.rowLabel}>Unrestricted Mitra (local only)</p>
                <p className={rowStyles.rowHint}>
                  Off by default. When on, Mitra may give a valuation view (undervalued, fairly valued, overvalued) and say whether the current price looks reasonable, from the data it has.
                  It is an AI opinion, not licensed advice. This option does not exist on the hosted site.
                </p>
              </div>
              <Switch
                label="Unrestricted Mitra"
                checked={prefs.chat.unrestricted}
                onChange={(v) => (v ? setConfirmingUnrestricted(true) : onPrefs({ chat: { unrestricted: false } }))}
              />
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={confirmingUnrestricted}
        title="Turn on unrestricted Mitra?"
        message="Mitra will be allowed to say whether a stock looks undervalued or overvalued and whether the price looks reasonable. These are AI opinions from public data, not licensed advice, and you make the decision. You can turn this off any time."
        confirmLabel="Turn on"
        onConfirm={() => {
          setConfirmingUnrestricted(false);
          onPrefs({ chat: { unrestricted: true } });
        }}
        onCancel={() => setConfirmingUnrestricted(false)}
      />

      <ConfirmDialog
        open={confirmRemove}
        title="Remove your AI key?"
        message="Mitra, insights and AI briefs stop working until you add a key again. You can add one any time."
        confirmLabel="Remove key"
        busy={busy === 'delete'}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
