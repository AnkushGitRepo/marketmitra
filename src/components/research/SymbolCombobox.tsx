'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { SearchResultOut } from '@/lib/dashboard/fundamentalsApi';
import styles from './SymbolCombobox.module.css';

const SEARCH_DELAY_MS = 200;
const MIN_QUERY = 2;
const MAX_OPTIONS = 8;

interface SymbolComboboxProps {
  readonly id: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit?: () => void;
}

/** A text field that suggests listed companies as you type. Free text still works: the server resolves aliases and names. */
export function SymbolCombobox({ id, value, placeholder, label, onChange, onSubmit }: SymbolComboboxProps) {
  const listId = useId();
  const [options, setOptions] = useState<readonly SearchResultOut[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const justPicked = useRef(false);
  const shown = value.trim().length >= MIN_QUERY ? options : [];

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) return;
        const rows = (await res.json()) as SearchResultOut[];
        setOptions(rows.filter((r) => r.type === 'company').slice(0, MAX_OPTIONS));
        setActive(-1);
      } catch {
        // Aborted or offline: keep the typed text, the server still resolves it.
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const pick = (option: SearchResultOut) => {
    justPicked.current = true;
    onChange(option.symbol);
    setOpen(false);
    setOptions([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const visible = open && shown.length > 0;
    if (e.key === 'ArrowDown' && visible) {
      e.preventDefault();
      setActive((i) => (i + 1) % shown.length);
    } else if (e.key === 'ArrowUp' && visible) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? shown.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter') {
      if (visible && active >= 0) {
        e.preventDefault();
        pick(shown[active]);
      } else {
        onSubmit?.();
      }
    }
  };

  return (
    <div className={styles.wrap}>
      <input
        id={id}
        className={styles.input}
        role="combobox"
        aria-label={label}
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && shown.length > 0 && (
        <ul id={listId} role="listbox" className={styles.list}>
          {shown.map((o, i) => (
            <li
              key={o.symbol}
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
              <span className={styles.symbol}>{o.symbol}</span>
              <span className={styles.name}>{o.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
