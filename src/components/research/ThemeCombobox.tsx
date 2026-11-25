'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ThemeSuggestion } from '@/lib/research/themeSuggestions';
import styles from './ThemeCombobox.module.css';

const DELAY_MS = 180;
const KIND_LABEL = { theme: 'Theme', sector: 'Sector', industry: 'Industry' } as const;

interface ThemeComboboxProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Called with the text to research: a picked suggestion's name, or what was typed when Enter is pressed. */
  readonly onSubmit: (text: string) => void;
}

const badge = (s: ThemeSuggestion): string => `${s.count} listed NSE ${s.count === 1 ? 'stock' : 'stocks'}`;

/** A text field that suggests themes, sectors and industries as you type, each with its company count and largest tickers. */
export function ThemeCombobox({ id, value, onChange, onSubmit }: ThemeComboboxProps) {
  const listId = useId();
  const [options, setOptions] = useState<readonly ThemeSuggestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const justPicked = useRef(false);

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/research/themes?q=${encodeURIComponent(value.trim())}`, { signal: controller.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { data?: ThemeSuggestion[] };
        setOptions(body.data ?? []);
        setLoaded(true);
        setActive(-1);
      } catch {
        // Aborted or offline: typed text still works, the server resolves it.
      }
    }, DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, open]);

  const pick = (option: ThemeSuggestion) => {
    justPicked.current = true;
    onChange(option.label);
    setOpen(false);
    onSubmit(option.label);
  };

  const visible = open && options.length > 0;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (options.length > 0) setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp' && visible) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visible && active >= 0) pick(options[active]);
      else {
        setOpen(false);
        onSubmit(value);
      }
    }
  };

  return (
    <div className={styles.wrap}>
      <input
        id={id}
        className={styles.input}
        role="combobox"
        aria-label="Theme or sector"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder="Try defence, rail, semiconductors, pharma, solar…"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && loaded && (
        <ul id={listId} role="listbox" className={styles.list}>
          {options.length === 0 && (
            <li role="presentation" className={styles.empty}>
              No listed theme matches this. Press Enter to research it as typed.
            </li>
          )}
          {options.map((o, i) => (
            <li
              key={`${o.kind}-${o.label}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={styles.option}
              data-active={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
            >
              <span className={styles.top}>
                <span className={styles.label}>{o.label}</span>
                <span className={styles.badge}>{badge(o)}</span>
              </span>
              <span className={styles.tickers}>
                <span className={styles.kind}>{KIND_LABEL[o.kind]}</span>
                {o.topTickers.length > 0 ? ` · ${o.topTickers.join(', ')}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
