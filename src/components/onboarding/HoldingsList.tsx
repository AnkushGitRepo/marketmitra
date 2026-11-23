'use client';

import { useState } from 'react';
import { formatSummary } from '@/lib/onboarding/holdingsSummary';
import { parseHoldingInput } from '@/lib/onboarding/holdingInput';
import { CheckIcon, PencilIcon, TrashIcon, XIcon } from './icons';
import styles from './Onboarding.module.css';

export interface HoldingRow {
  readonly id: string;
  readonly symbol: string;
  readonly quantity: number;
  readonly avgPrice: number;
}

interface HoldingsListProps {
  readonly holdings: readonly HoldingRow[];
  readonly analystsActive: boolean;
  /** Ids of holdings that were already saved when the wizard opened; they are labelled Active, the rest New. */
  readonly activeIds: ReadonlySet<string>;
  /** Re-reads the saved holdings after an edit or removal. */
  readonly onChanged: () => Promise<void>;
}

interface Draft {
  readonly id: string;
  readonly quantity: string;
  readonly avgPrice: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** The holdings saved so far. Every edit and removal is a real change to the user's portfolio (the same endpoints the Portfolio page uses). */
export function HoldingsList({ holdings, analystsActive, activeIds, onChanged }: HoldingsListProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    try {
      const failure = await action();
      if (failure) setError(failure);
      else await onChanged();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const save = (h: HoldingRow) =>
    draft &&
    run(async () => {
      const parsed = parseHoldingInput({ symbol: h.symbol, quantity: draft.quantity, avgPrice: draft.avgPrice });
      if (!parsed.ok) return parsed.error;
      const res = await fetch(`/api/holdings/${h.id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ quantity: parsed.value.quantity, avgPrice: parsed.value.avgPrice }) });
      if (!res.ok) return `Could not update ${h.symbol}. Try again.`;
      setDraft(null);
      return null;
    });

  const remove = (h: HoldingRow) =>
    run(async () => {
      setConfirmRemoveId(null);
      const res = await fetch(`/api/holdings/${h.id}`, { method: 'DELETE' });
      return res.ok ? null : `Could not remove ${h.symbol}. Try again.`;
    });

  const clearAll = () =>
    run(async () => {
      const results = await Promise.all(holdings.map((h) => fetch(`/api/holdings/${h.id}`, { method: 'DELETE' }).then((r) => r.ok, () => false)));
      setConfirmClear(false);
      setDraft(null);
      return results.every(Boolean) ? null : 'Some holdings could not be removed. Try again.';
    });

  if (holdings.length === 0) return null;

  return (
    <section className={styles.listWrap} aria-label="Your holdings">
      <div className={styles.listHeader}>
        <strong>{formatSummary(holdings)}</strong>
        {confirmClear ? (
          <span className={styles.confirm}>
            Remove all {holdings.length} from your portfolio?
            <button type="button" className={styles.dangerLink} onClick={() => void clearAll()} disabled={busy}>
              Yes, remove all
            </button>
            <button type="button" className={styles.link} onClick={() => setConfirmClear(false)} disabled={busy}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className={styles.link} onClick={() => setConfirmClear(true)} disabled={busy}>
            Clear all
          </button>
        )}
      </div>

      <ul className={styles.holdings}>
        {holdings.map((h) => {
          const editing = draft?.id === h.id;
          return (
            <li key={h.id} className={styles.holding}>
              {editing ? (
                <form
                  className={styles.editRow}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(h);
                  }}
                >
                  <span className={styles.symbol}>{h.symbol}</span>
                  <input className={`${styles.input} ${styles.inputCompact}`} aria-label={`${h.symbol} quantity`} inputMode="numeric" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} autoFocus />
                  <span aria-hidden="true">@ ₹</span>
                  <input className={`${styles.input} ${styles.inputCompact}`} aria-label={`${h.symbol} average price in rupees`} inputMode="decimal" value={draft.avgPrice} onChange={(e) => setDraft({ ...draft, avgPrice: e.target.value })} />
                  <button type="submit" className={styles.iconButton} aria-label={`Save ${h.symbol}`} disabled={busy}>
                    <CheckIcon size={16} />
                  </button>
                  <button type="button" className={styles.iconButton} aria-label="Cancel editing" onClick={() => setDraft(null)} disabled={busy}>
                    <XIcon size={16} />
                  </button>
                </form>
              ) : (
                <>
                  <span className={styles.holdingText}>
                    <span className={styles.symbol}>{h.symbol}</span> · {h.quantity} shares @ ₹{h.avgPrice.toLocaleString('en-IN')}
                  </span>
                  {activeIds.has(h.id) ? (
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>Active</span>
                  ) : (
                    <span className={`${styles.badge} ${analystsActive ? '' : styles.badgeMuted}`}>{analystsActive ? 'New · Analyst will be created' : 'New · Analysts are off in Settings'}</span>
                  )}
                  {confirmRemoveId === h.id ? (
                    <span className={styles.confirm}>
                      Remove {h.symbol} from your portfolio?
                      <button type="button" className={styles.dangerLink} onClick={() => void remove(h)} disabled={busy}>
                        Yes, remove
                      </button>
                      <button type="button" className={styles.link} onClick={() => setConfirmRemoveId(null)} disabled={busy}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                  <span className={styles.rowActions}>
                    <button type="button" className={styles.iconButton} aria-label={`Edit ${h.symbol}`} onClick={() => setDraft({ id: h.id, quantity: String(h.quantity), avgPrice: String(h.avgPrice) })} disabled={busy}>
                      <PencilIcon size={16} />
                    </button>
                    <button type="button" className={styles.iconButton} aria-label={`Remove ${h.symbol}`} onClick={() => (activeIds.has(h.id) ? setConfirmRemoveId(h.id) : void remove(h))} disabled={busy}>
                      <TrashIcon size={16} />
                    </button>
                  </span>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
