'use client';

import { useState } from 'react';
import { PROVIDER_LABELS } from '@/lib/ai/providers';
import type { AiProvider } from '@/lib/userSettings';
import { ChevronDownIcon, KeyRoundIcon, LockIcon } from './icons';
import styles from './Onboarding.module.css';

const PROVIDERS: readonly AiProvider[] = ['gemini', 'anthropic', 'openrouter'];

const GET_KEY: Record<AiProvider, { href: string; text: string }> = {
  gemini: { href: 'https://aistudio.google.com/apikey', text: 'Get a Gemini key (free tier available)' },
  anthropic: { href: 'https://console.anthropic.com/settings/keys', text: 'Get an Anthropic key' },
  openrouter: { href: 'https://openrouter.ai/keys', text: 'Get an OpenRouter key' },
};

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'ok'; readonly provider: AiProvider; readonly model: string | null; readonly latencyMs: number }
  | { readonly kind: 'fail'; readonly text: string };

interface AiStepProps {
  /** The provider of an already-saved key, or null when none is saved. */
  readonly savedProvider: AiProvider | null;
  readonly onSaved: (provider: AiProvider) => void;
  readonly hosted: boolean;
}

/** Step 3. The test endpoint checks the stored key, so "Save and test" saves first, then tests, and the key never comes back to the browser. */
export function AiStep({ savedProvider, onSaved, hosted }: AiStepProps) {
  const [provider, setProvider] = useState<AiProvider>(savedProvider ?? 'gemini');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<Status>(savedProvider ? { kind: 'ok', provider: savedProvider, model: null, latencyMs: 0 } : { kind: 'idle' });

  const saveAndTest = async () => {
    if (apiKey.trim().length < 10) return setStatus({ kind: 'fail', text: 'Paste your provider API key first.' });
    setStatus({ kind: 'running' });
    try {
      const put = await fetch('/api/settings/ai', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, apiKey: apiKey.trim() }) });
      if (!put.ok) {
        const body = (await put.json().catch(() => null)) as { error?: string } | null;
        return setStatus({ kind: 'fail', text: body?.error ?? 'Could not save the key.' });
      }
      setApiKey('');
      onSaved(provider);
      const res = await fetch('/api/settings/ai/test', { method: 'POST' });
      const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string; data?: { model?: string | null; latencyMs?: number } } | null;
      if (res.ok && body?.success) setStatus({ kind: 'ok', provider, model: body.data?.model ?? null, latencyMs: body.data?.latencyMs ?? 0 });
      else setStatus({ kind: 'fail', text: `The key was saved, but the test failed: ${body?.error ?? 'no answer from the provider'}. Check the key and try again.` });
    } catch {
      setStatus({ kind: 'fail', text: 'Could not reach the server. Try again.' });
    }
  };

  const link = GET_KEY[provider];
  return (
    <>
      <p className={styles.eyebrow}>Step 3 of 3</p>
      <span className={`${styles.iconBadge} ${styles.tone_balanced}`} aria-hidden="true">
        <KeyRoundIcon size={20} />
      </span>
      <h1 className={styles.title}>Power your AI analysts</h1>
      <p className={styles.lead}>
        MarketMitra has no AI quota of its own: analysts and briefs run on your own provider key, which is stored encrypted and never shown again.
        {hosted ? ' On the hosted site, automatic analysts make at most 20 AI calls a day on your key.' : ''} Without a key, the portfolio risk cards, screener and alerts still work.
      </p>

      <form
        className={styles.row}
        onSubmit={(e) => {
          e.preventDefault();
          void saveAndTest();
        }}
      >
        <div className={styles.field}>
          <select className={styles.select} aria-label="AI provider" value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
          <span className={styles.selectChevron} aria-hidden="true">
            <ChevronDownIcon size={16} />
          </span>
        </div>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <input
            className={styles.input}
            type="password"
            autoComplete="off"
            aria-label="API key"
            placeholder={savedProvider ? 'A key is saved. Paste a new one to replace it' : 'Paste your API key'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <button type="submit" className={styles.secondary} disabled={status.kind === 'running'}>
          {status.kind === 'running' ? 'Testing…' : 'Save and test key'}
        </button>
      </form>
      <p className={styles.secure}>
        <LockIcon size={14} /> Encrypted at rest (AES-256-GCM) and never sent back to your browser.
      </p>
      <a className={styles.note} href={link.href} target="_blank" rel="noopener noreferrer">
        {link.text} ↗
      </a>

      <div aria-live="polite">
        {status.kind === 'ok' && (
          <span className={`${styles.status} ${styles.statusOk}`}>
            ✓ Connected ({PROVIDER_LABELS[status.provider]}
            {status.model ? ` · ${status.model}` : ''}
            {status.latencyMs ? ` · ${status.latencyMs} ms` : ''})
          </span>
        )}
        {status.kind === 'fail' && (
          <p className={styles.error} role="alert">
            {status.text}
          </p>
        )}
      </div>
    </>
  );
}
