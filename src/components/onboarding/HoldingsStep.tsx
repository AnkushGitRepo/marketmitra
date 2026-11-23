'use client';

import { useRef, useState, type DragEvent } from 'react';
import { ImportPreviewCard } from '@/components/appshell/ImportPreviewCard';
import { SearchResultsDropdown } from '@/components/dashboard-charts/SearchResultsDropdown';
import type { SearchResultOut } from '@/lib/dashboard/fundamentalsApi';
import { parseHoldingInput } from '@/lib/onboarding/holdingInput';
import type { ProposedChange } from '@/lib/portfolio-import/types';
import { useTickerSearch } from './useTickerSearch';
import styles from './Onboarding.module.css';

export interface HoldingRow {
  readonly symbol: string;
  readonly quantity: number;
  readonly avgPrice: number;
}

interface HoldingsStepProps {
  readonly holdings: readonly HoldingRow[];
  /** Re-reads the saved holdings from the server (after a quick add or a confirmed import). */
  readonly onChanged: () => Promise<void>;
  readonly analystsActive: boolean;
}

const POPULAR = ['RELIANCE', 'HDFCBANK', 'TCS', 'NIFTYBEES'] as const;
const FILE_TYPES = /\.(csv|xlsx)$/i;

/** Step 2. Saves holdings through the same endpoints the Portfolio page uses, so guardrails and analysts follow the usual rules. */
export function HoldingsStep({ holdings, onChanged, analystsActive }: HoldingsStepProps) {
  const [query, setQuery] = useState('');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<ProposedChange[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { results, loading } = useTickerSearch(symbol ? '' : query);

  const pick = (r: SearchResultOut) => {
    setSymbol(r.symbol);
    setQuery(r.symbol);
    setOpen(false);
  };

  const add = async () => {
    const parsed = parseHoldingInput({ symbol, quantity, avgPrice });
    if (!parsed.ok) return setError(parsed.error);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/holdings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.value) });
      if (!res.ok) return setError('Could not add that holding. Check the details and try again.');
      setQuery('');
      setSymbol('');
      setQuantity('');
      setAvgPrice('');
      await onChanged();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!FILE_TYPES.test(file.name)) return setError('Upload a .csv or .xlsx holdings export from your broker.');
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/portfolio-import/extract', { method: 'POST', body: form });
      const body = (await res.json().catch(() => null)) as { data?: ProposedChange[]; message?: string } | null;
      if (!res.ok || !body?.data) return setError(body?.message ?? 'Could not read that file.');
      setChanges(body.data);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    void upload(e.dataTransfer.files[0]);
  };

  return (
    <>
      <p className={styles.eyebrow}>Step 2 of 3</p>
      <h1 className={styles.title}>Add your holdings</h1>
      <p className={styles.lead}>
        Each holding gets its own AI analyst that tracks filings and price moves. Skip this and add holdings later from the Portfolio page.
      </p>

      {changes ? (
        <ImportPreviewCard
          changes={changes}
          onDone={() => {
            setChanges(null);
            void onChanged();
          }}
        />
      ) : (
        <label
          className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <strong>Drop a holdings file here, or choose one</strong>
          <span>CSV or XLSX with a symbol, quantity and average price column. You review every row before anything is saved.</span>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" className={styles.srOnly} disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
        </label>
      )}

      <div>
        <p className={styles.note}>Or add one by hand</p>
        <div className={styles.row}>
          <div className={styles.field}>
            <input
              className={styles.input}
              aria-label="Search NSE stock"
              placeholder="Search a stock, e.g. RELIANCE"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSymbol('');
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
            />
            {open && !symbol && (
              <div className={styles.dropdownAnchor}>
                <SearchResultsDropdown results={results} loading={loading} onSelect={pick} query={query} />
              </div>
            )}
          </div>
          <div className={`${styles.field} ${styles.fieldSmall}`}>
            <input className={styles.input} aria-label="Quantity" inputMode="numeric" placeholder="Qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className={`${styles.field} ${styles.fieldSmall}`}>
            <input className={styles.input} aria-label="Average buy price in rupees" inputMode="decimal" placeholder="Avg ₹" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} />
          </div>
          <button type="button" className={styles.secondary} onClick={() => void add()} disabled={busy}>
            Add
          </button>
        </div>
        <div className={styles.chips} aria-label="Popular stocks">
          {POPULAR.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.chip}
              onClick={() => {
                setSymbol(s);
                setQuery(s);
                setOpen(false);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {holdings.length > 0 && (
        <ul className={styles.holdings} aria-label="Your holdings">
          {holdings.map((h) => (
            <li key={h.symbol} className={styles.holding}>
              <span>
                <span className={styles.symbol}>{h.symbol}</span> · {h.quantity} shares @ ₹{h.avgPrice.toLocaleString('en-IN')}
              </span>
              <span className={`${styles.badge} ${analystsActive ? '' : styles.badgeMuted}`}>
                {analystsActive ? 'Analyst will be created' : 'Analysts are off in Settings'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
