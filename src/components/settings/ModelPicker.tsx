'use client';

import { useEffect, useRef, useState } from 'react';
import type { AiProvider } from '@/lib/ai/providerCatalog';
import { MODEL_OPTIONS, isValidModelId } from '@/lib/ai/providers';
import { curatedList, groupForPicker, labelFor, type ModelListResult } from '@/lib/ai/pickerModels';
import styles from './ModelPicker.module.css';

const MIN_KEY_CHARS = 10;
const TYPED_KEY_DEBOUNCE_MS = 500;

interface ModelPickerProps {
  readonly provider: AiProvider;
  /** A key typed but not saved yet; with it the list is fetched for that key. Without it the saved key is used. */
  readonly apiKey?: string;
  /** The chosen model ID; empty means the provider's default. */
  readonly value: string;
  readonly onChange: (model: string) => void;
}

/**
 * One model picker for Settings and the setup wizard (#333): searchable, grouped Latest / Free / Other, a Free badge, a warning when a model
 * is known not to support tool calls, and a field for any model ID. It shows the curated list at once and swaps in the live list from the
 * provider when it arrives; if that fails the curated list stays, so the picker is never empty.
 */
export function ModelPicker({ provider, apiKey = '', value, onChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; result: ModelListResult } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const typedKey = apiKey.trim().length >= MIN_KEY_CHARS ? apiKey.trim() : '';
  const requestKey = `${provider}|${typedKey}`;

  // Fetch the live list when the picker opens, and again if the provider or a typed key changes while it is open. The key goes to our
  // own server only; it never appears in the URL.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        fetch('/api/settings/ai/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, ...(typedKey ? { apiKey: typedKey } : {}) }),
          signal: controller.signal,
        })
          .then((res) => res.json())
          .then((json: { success?: boolean; data?: ModelListResult }) => {
            if (json?.success && json.data) setLoaded({ key: requestKey, result: json.data });
          })
          .catch(() => undefined);
      },
      typedKey ? TYPED_KEY_DEBOUNCE_MS : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, provider, typedKey, requestKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const live = loaded?.key === requestKey ? loaded.result : null;
  const result = live ?? curatedList(provider);
  const loading = open && live === null;
  const defaultLabel = MODEL_OPTIONS[provider][0].label;
  const groups = groupForPicker(result.models, query);
  const first = groups[0]?.models[0];

  const choose = (model: string) => {
    onChange(model);
    setOpen(false);
    setQuery('');
    trigger.current?.focus();
  };

  const applyCustom = () => {
    const id = custom.trim();
    if (!id) return setCustomError('Enter a model ID.');
    if (!isValidModelId(id)) return setCustomError('Use letters, digits and . _ : / - only.');
    setCustomError(null);
    setCustom('');
    choose(id);
  };

  return (
    <div
      ref={root}
      className={styles.root}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button ref={trigger} type="button" className={styles.trigger} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={styles.current}>{labelFor(result.models, value, defaultLabel)}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className={styles.panel}>
          <input
            className={styles.search}
            type="search"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder={`Search ${result.models.length} models`}
            aria-label="Search models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (first) choose(first.value);
              }
            }}
          />
          <p className={styles.status} role="status">
            {loading ? 'Loading your provider’s list…' : result.source === 'live' ? 'Live list from your provider' : 'Showing our curated list'}
          </p>

          <div className={styles.list} role="listbox" aria-label="Models">
            {!query && (
              <button type="button" role="option" aria-selected={value === ''} className={`${styles.option} ${value === '' ? styles.selected : ''}`} onClick={() => choose('')}>
                <span>{defaultLabel}</span>
                <span className={styles.badge}>Default</span>
              </button>
            )}
            {groups.map((g) => (
              <div key={g.tier} role="group" aria-label={g.label}>
                <p className={styles.groupTitle}>{g.label}</p>
                {g.models.map((m) => (
                  <button key={m.value} type="button" role="option" aria-selected={value === m.value} className={`${styles.option} ${value === m.value ? styles.selected : ''}`} onClick={() => choose(m.value)}>
                    <span className={styles.name}>{m.label}</span>
                    {m.free && <span className={`${styles.badge} ${styles.free}`}>Free</span>}
                    {m.tools === false && (
                      <span className={`${styles.badge} ${styles.warn}`} title="This model is not listed as supporting tool calls, so Mitra's lookups may fail with it.">
                        ⚠ may lack tools
                      </span>
                    )}
                  </button>
                ))}
                {g.hidden > 0 && <p className={styles.more}>{g.hidden} more match: keep typing to narrow the list.</p>}
              </div>
            ))}
            {groups.length === 0 && <p className={styles.more}>No model matches “{query}”. Use a model ID below.</p>}
          </div>

          <div className={styles.customRow}>
            <input
              className={styles.search}
              autoComplete="off"
              spellCheck={false}
              aria-label="Custom model ID"
              placeholder="Or type any model ID"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                setCustomError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyCustom();
                }
              }}
            />
            <button type="button" className={styles.use} onClick={applyCustom}>
              Use
            </button>
          </div>
          {customError && (
            <p className={styles.error} role="alert">
              {customError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
