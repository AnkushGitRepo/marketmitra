'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MODEL_OPTIONS, PROVIDER_LABELS } from '@/lib/ai/providers';
import type { AiProvider, AiSettingsView } from '@/lib/userSettings';
import styles from './page.module.css';

const PROVIDERS: AiProvider[] = ['gemini', 'anthropic', 'openrouter'];

const KEY_HINTS: Record<AiProvider, string> = {
  gemini: 'From aistudio.google.com/apikey — a generous free tier.',
  anthropic: 'From console.anthropic.com — starts "sk-ant-".',
  openrouter: 'From openrouter.ai/keys — routes to many models.',
};

interface SettingsClientProps {
  initialView: AiSettingsView | null;
  encConfigured: boolean;
}

export function SettingsClient({ initialView, encConfigured }: SettingsClientProps) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [provider, setProvider] = useState<AiProvider>(initialView?.provider ?? 'gemini');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(initialView?.model ?? '');
  // The dropdown's own value: '' = default, '__custom__' = show the free-text
  // field below, or one of MODEL_OPTIONS[provider]'s values. Starts on
  // '__custom__' when the stored model isn't one of the curated picks (e.g.
  // a self-host operator's own choice), so it's never silently discarded.
  const initialKnown = MODEL_OPTIONS[provider].some((o) => o.value === (initialView?.model ?? ''));
  const [modelChoice, setModelChoice] = useState(
    initialView?.model ? (initialKnown ? initialView.model : '__custom__') : ''
  );
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    try {
      await fetch('/api/settings/ai', { method: 'DELETE' });
      setView(null);
      setApiKey('');
      setModel('');
      setModelChoice('');
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.card}>
      {!encConfigured && (
        <p className={styles.warn}>
          This deployment has no <code>SETTINGS_ENC_KEY</code>, so a key can&rsquo;t be stored here.
          Set <code>AI_PROVIDER</code> / <code>AI_API_KEY</code> as environment variables instead.
        </p>
      )}

      {view && (
        <p className={styles.currentRow}>
          <span className={styles.currentBadge}>Connected</span>
          {PROVIDER_LABELS[view.provider]}
          {view.model ? ` · ${view.model}` : ' · default model'} · key ends{' '}
          <code>••••{view.keyHint}</code>
        </p>
      )}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Provider</span>
        <select
          className={styles.select}
          value={provider}
          onChange={(e) => {
            // A model ID from one provider is meaningless (or actively
            // wrong) for another — reset to that provider's default rather
            // than silently submitting a mismatched model on save.
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
        <span className={styles.fieldHint}>{KEY_HINTS[provider]}</span>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>API key</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={view ? 'Paste a new key to replace the stored one' : 'Paste your key'}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Model</span>
        <select
          className={styles.select}
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
        {modelChoice === '__custom__' && (
          <input
            className={styles.input}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. gemini-3.8-flash"
          />
        )}
      </label>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.btnPrimary} onClick={save} disabled={busy !== null || !encConfigured}>
          {busy === 'save' ? 'Testing key…' : 'Test & save'}
        </button>
        {view && (
          <button type="button" className={styles.btnDanger} onClick={remove} disabled={busy !== null}>
            {busy === 'delete' ? 'Removing…' : 'Remove key'}
          </button>
        )}
      </div>
    </div>
  );
}
