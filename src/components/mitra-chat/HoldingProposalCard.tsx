'use client';

import { useState } from 'react';
import { formatInr } from '@/lib/dashboard/format';
import { outcomeText, requestFor, validEntry, type HoldingProposal, type HoldingProposalOutput } from '@/lib/mitra-chat/holdingProposal';
import styles from './HoldingProposalCard.module.css';

interface HoldingProposalCardProps {
  readonly proposal: HoldingProposal;
  readonly output: Extract<HoldingProposalOutput, { status: 'awaiting_confirmation' }>;
  /** Present only while the card can still be decided; without it the card is a read-only record. */
  readonly onDecision?: (text: string) => void;
}

const TITLE = { add: 'Add to portfolio', update: 'Update holding', remove: 'Remove from portfolio' } as const;
const CONFIRM = { add: 'Confirm and add', update: 'Confirm and update', remove: 'Confirm remove' } as const;

/** Mitra's proposed change to a holding. Nothing is saved until Confirm is clicked; the numbers can be edited first. */
export function HoldingProposalCard({ proposal, output, onDecision }: HoldingProposalCardProps) {
  const { action, symbol, current } = output;
  const [quantity, setQuantity] = useState(String(proposal.quantity ?? current?.quantity ?? ''));
  const [avgPrice, setAvgPrice] = useState(String(proposal.avgPrice ?? current?.avgPrice ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = action !== 'remove';
  const qty = Number(quantity);
  const price = Number(avgPrice);
  const valid = !editable || validEntry(qty, price);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const req = requestFor(output, qty, price);
    try {
      const res = await fetch(req.url, {
        method: req.method,
        ...(req.body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) } : {}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save the change.');
      }
      onDecision?.(outcomeText(action, symbol, 'confirmed', qty, price));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the change.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.card} role="group" aria-label={`${TITLE[action]}: ${symbol}`}>
      <p className={styles.title}>
        {TITLE[action]} · <strong>{symbol}</strong>
      </p>
      {current && (
        <p className={styles.current}>
          Now: {current.quantity} shares at {formatInr(current.avgPrice)}
        </p>
      )}
      {editable ? (
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>Shares</span>
            <input className={styles.input} type="number" inputMode="decimal" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={!onDecision || busy} />
          </label>
          <label className={styles.field}>
            <span>Avg price (₹)</span>
            <input className={styles.input} type="number" inputMode="decimal" min="0" step="any" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} disabled={!onDecision || busy} />
          </label>
        </div>
      ) : (
        <p className={styles.current}>This deletes the holding and its saved record. It cannot be undone from here.</p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {onDecision && (
        <div className={styles.actions}>
          <button type="button" className={`${styles.confirm} ${action === 'remove' ? styles.danger : ''}`} disabled={busy || !valid} onClick={() => void confirm()}>
            {busy ? 'Saving…' : CONFIRM[action]}
          </button>
          <button type="button" className={styles.cancel} disabled={busy} onClick={() => onDecision(outcomeText(action, symbol, 'cancelled'))}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
