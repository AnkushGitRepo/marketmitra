'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { MAX_GRAMS, MAX_NOTE, MAX_PRICE_PER_GRAM, type BullionMetal, type GoldPurity } from '@/lib/bullion/schema';
import type { BullionSummary, PricedEntry } from '@/lib/bullion/value';
import { formatInr } from '@/lib/dashboard/format';
import { useMask } from '@/lib/dashboard/MaskContext';
import { shortDate } from '@/lib/tax/format';
import cash from './CashManager.module.css';
import styles from './BullionManager.module.css';

interface BullionManagerProps {
  readonly summary: BullionSummary;
  readonly assumptions: { readonly importDutyPct: number; readonly dutyEffectiveFrom: string; readonly dutyCheckedOn: string; readonly dutyStale: boolean } | null;
}

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.ok) return null;
    return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'That did not work.';
  } catch {
    return 'Could not reach the server. Try again.';
  }
}

const parse = (text: string, max: number): number | null => {
  const n = Number(text.replace(/,/g, '').trim());
  return text.trim() !== '' && Number.isFinite(n) && n > 0 && n <= max ? n : null;
};

const signed = (n: number) => `${n >= 0 ? '+' : '-'}`;

/** Physical gold, silver and platinum by weight. Values are estimates at the Indian parity price (ADR 0086), and say so. */
export function BullionManager({ summary, assumptions }: BullionManagerProps) {
  const router = useRouter();
  const { masked } = useMask();
  const [metal, setMetal] = useState<BullionMetal>('gold');
  const [purity, setPurity] = useState<GoldPurity>('24k');
  const [grams, setGrams] = useState('');
  const [buy, setBuy] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editGrams, setEditGrams] = useState('');
  const [editBuy, setEditBuy] = useState('');
  const [removing, setRemoving] = useState<PricedEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<string | null>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const problem = await task();
    setBusy(false);
    if (problem) setError(problem);
    else router.refresh();
    return problem === null;
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const g = parse(grams, MAX_GRAMS);
    const b = buy.trim() === '' ? null : parse(buy, MAX_PRICE_PER_GRAM);
    if (g === null) return setError('Enter a weight in grams above zero.');
    if (buy.trim() !== '' && b === null) return setError('Enter the buy price per gram as a number above zero, or leave it empty.');
    const body = { metal, ...(metal === 'gold' ? { purity } : {}), grams: g, buyPricePerGram: b, ...(note.trim() ? { note: note.trim() } : {}) };
    if (await run(() => send('/api/bullion', 'POST', body))) {
      setGrams('');
      setBuy('');
      setNote('');
    }
  };

  const saveEdit = async (id: string) => {
    const g = parse(editGrams, MAX_GRAMS);
    const b = editBuy.trim() === '' ? null : parse(editBuy, MAX_PRICE_PER_GRAM);
    if (g === null) return setError('Enter a weight in grams above zero.');
    if (editBuy.trim() !== '' && b === null) return setError('Enter the buy price per gram as a number above zero, or leave it empty.');
    if (await run(() => send(`/api/bullion/${id}`, 'PATCH', { grams: g, buyPricePerGram: b }))) setEditing(null);
  };

  return (
    <section className={cash.panel} aria-labelledby="metals-title">
      <h2 id="metals-title" className={cash.title}>Physical gold, silver and platinum</h2>
      <p className={cash.hint}>Metal you hold outside these stocks. Values are <strong>estimates</strong>: the international price in rupees plus India&rsquo;s {assumptions?.importDutyPct ?? 15}% import duty
        {assumptions ? ` (last confirmed ${shortDate(assumptions.dutyCheckedOn)})` : ''}. Not an IBJA or jeweller&rsquo;s rate, and without making charges or GST.</p>
      {assumptions?.dutyStale ? <p className={cash.error} role="note">The duty has not been confirmed for over 45 days, so these values may be off if it changed.</p> : null}

      {summary.rows.length > 0 ? (
        <ul className={cash.list}>
          {summary.rows.map((r) => (
            <li key={r.entry.id} className={cash.item}>
              <span className={cash.name}>
                {r.label}
                <span className={styles.sub}>{r.entry.note ? ` · ${r.entry.note}` : ''}</span>
              </span>
              {editing === r.entry.id ? (
                <>
                  <input className={cash.input} inputMode="decimal" value={editGrams} onChange={(e) => setEditGrams(e.target.value)} aria-label={`Grams of ${r.label}`} />
                  <input className={cash.input} inputMode="decimal" value={editBuy} onChange={(e) => setEditBuy(e.target.value)} placeholder="Buy ₹/g (optional)" aria-label={`Buy price per gram for ${r.label}`} />
                  <button type="button" className={cash.primary} disabled={busy} onClick={() => saveEdit(r.entry.id)}>Save</button>
                  <button type="button" className={cash.link} onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <span className={cash.amount}>{masked ? '•••' : `${r.entry.grams.toLocaleString('en-IN')} g`}</span>
                  <span className={cash.amount}>{r.value === null ? 'No price' : formatInr(r.value, 0, masked)}</span>
                  {r.gain !== null && r.gainPct !== null ? (
                    <span className={r.gain >= 0 ? styles.up : styles.down}>{signed(r.gain)}{formatInr(Math.abs(r.gain), 0, masked)} ({signed(r.gain)}{Math.abs(r.gainPct).toFixed(1)}%)</span>
                  ) : null}
                  <button type="button" className={cash.link} onClick={() => { setEditing(r.entry.id); setEditGrams(String(r.entry.grams)); setEditBuy(r.entry.buyPricePerGram === null ? '' : String(r.entry.buyPricePerGram)); }}>Edit</button>
                  <button type="button" className={cash.danger} disabled={busy} onClick={() => setRemoving(r)}>Remove</button>
                </>
              )}
            </li>
          ))}
          <li className={`${cash.item} ${cash.total}`}>
            <span className={cash.name}>Estimated total{summary.unpriced > 0 ? ` (${summary.unpriced} without a price)` : ''}</span>
            <span className={cash.amount}>{formatInr(summary.totalValue, 0, masked)}</span>
          </li>
        </ul>
      ) : (
        <p className={cash.empty}>No metal recorded yet.</p>
      )}

      <form className={cash.addRow} onSubmit={add}>
        <select className={cash.input} value={metal} onChange={(e) => setMetal(e.target.value as BullionMetal)} aria-label="Metal">
          <option value="gold">Gold</option>
          <option value="silver">Silver (999)</option>
          <option value="platinum">Platinum (999)</option>
        </select>
        {metal === 'gold' ? (
          <select className={cash.input} value={purity} onChange={(e) => setPurity(e.target.value as GoldPurity)} aria-label="Gold purity">
            <option value="24k">24K (999)</option>
            <option value="22k">22K (916)</option>
          </select>
        ) : null}
        <input className={cash.input} inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="Weight (grams)" aria-label="Weight in grams" />
        <input className={cash.input} inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="Buy price per gram (optional)" aria-label="Buy price per gram" />
        <input className={cash.input} value={note} maxLength={MAX_NOTE} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. coins (optional)" aria-label="Note" />
        <button type="submit" className={cash.primary} disabled={busy}>Add</button>
      </form>
      {error ? <p className={cash.error} role="alert">{error}</p> : null}

      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove ${removing.label}?` : 'Remove?'}
        message="This entry is removed from your metals. Nothing else is affected."
        confirmLabel="Remove"
        busy={busy}
        onConfirm={() => void (removing && run(() => send(`/api/bullion/${removing.entry.id}`, 'DELETE')).then(() => setRemoving(null)))}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
