'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { compareHref, MAX_COMPARE } from '@/lib/funds/compare';
import { parseSchemeCode } from '@/lib/funds/types';
import styles from './CompareAdd.module.css';

interface CompareAddProps {
  /** The funds already picked; the link is rebuilt from these plus the one added. */
  readonly codes: readonly number[];
  /** Same plan and option as the funds already being compared, so the comparison is like for like. */
  readonly plan: string;
  readonly option: string;
  readonly label?: string;
}

interface Match {
  readonly code: number;
  readonly name: string;
  readonly sub: string;
}

const SEARCH_DEBOUNCE_MS = 250;
const MAX_RESULTS = 8;
const MIN_QUERY_CHARS = 2;

function toMatches(payload: unknown, taken: readonly number[]): Match[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  return items.flatMap((raw): Match[] => {
    const item = raw as { scheme_code?: unknown; base_name?: unknown; fund_house?: unknown; sub_category?: unknown; category?: unknown };
    const code = typeof item.scheme_code === 'number' ? parseSchemeCode(String(item.scheme_code)) : null;
    if (code === null || taken.includes(code) || typeof item.base_name !== 'string') return [];
    const house = typeof item.fund_house === 'string' ? item.fund_house.replace(/ Mutual Fund$/, '') : '';
    const kind = typeof item.sub_category === 'string' ? item.sub_category : typeof item.category === 'string' ? item.category : '';
    return [{ code, name: item.base_name, sub: [house, kind].filter(Boolean).join(' · ') }];
  });
}

/** Add a fund to the comparison without leaving the page. The link (`?codes=`) stays the source of truth. */
export function CompareAdd({ codes, plan, option, label = '+ Add fund' }: CompareAddProps) {
  const router = useRouter();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<readonly Match[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const request = useRef(0);

  if (codes.length >= MAX_COMPARE) return null;

  const search = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    const query = text.trim();
    const id = ++request.current;
    // Results of an earlier query are cleared as soon as the text changes, so a stale fund is never clickable.
    setMatches([]);
    if (query.length < MIN_QUERY_CHARS) {
      setMessage(null);
      return;
    }
    setMessage('Searching…');
    timer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, plan, option, limit: String(MAX_RESULTS + MAX_COMPARE), sort: 'ret_3y', order: 'desc' });
        const response = await fetch(`/api/funds?${params.toString()}`);
        if (id !== request.current) return;
        const found = response.ok ? toMatches(await response.json(), codes) : null;
        if (id !== request.current) return;
        if (found === null) {
          setMatches([]);
          setMessage('Could not search just now. Try again in a moment.');
        } else {
          setMatches(found.slice(0, MAX_RESULTS));
          setMessage(found.length === 0 ? 'No matching fund (same plan and option as the ones you are comparing).' : null);
        }
      } catch {
        if (id === request.current) {
          setMatches([]);
          setMessage('Could not search just now. Try again in a moment.');
        }
      }
    }, SEARCH_DEBOUNCE_MS);
  };

  const close = (returnFocus = false) => {
    request.current += 1;
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
    setMatches([]);
    setMessage(null);
    if (returnFocus) trigger.current?.focus();
  };

  const pick = (code: number) => {
    close();
    router.push(compareHref([...codes, code]));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') close(true);
  };

  return (
    <div className={styles.root} onKeyDown={onKeyDown}>
      <button ref={trigger} type="button" className={styles.trigger} aria-expanded={open} aria-controls={panelId} onClick={() => (open ? close(true) : setOpen(true))}>
        {label}
      </button>
      {open && (
        <div id={panelId} className={styles.panel} role="dialog" aria-label="Add a fund to compare">
          <label className={styles.field}>
            <span className={styles.label}>Search a fund by name</span>
            <input className={styles.input} type="search" autoFocus maxLength={80} placeholder="e.g. Nifty 50 Index" onChange={(e) => search(e.target.value)} />
          </label>
          <p className={styles.status} role="status">{message ?? (matches.length > 0 ? `${matches.length} found` : '')}</p>
          {matches.length > 0 && (
            <ul className={styles.results}>
              {matches.map((m) => (
                <li key={m.code}>
                  <button type="button" className={styles.result} onClick={() => pick(m.code)}>
                    <span className={styles.name}>{m.name}</span>
                    <span className={styles.sub}>{m.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
