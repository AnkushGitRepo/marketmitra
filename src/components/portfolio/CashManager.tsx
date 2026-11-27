'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatInr } from '@/lib/dashboard/format';
import { useMask } from '@/lib/dashboard/MaskContext';
import { MAX_AMOUNT, MAX_LABEL, totalCash, type CashEntry } from '@/lib/cash/schema';
import styles from './CashManager.module.css';

/** Props: `includeCash` and `onIncludeCash` together add a "Show in allocation" switch; the cash page omits them. */
interface CashManagerProps {
  readonly entries: readonly CashEntry[];
  /** When both are given, a "Show in allocation" switch is shown. */
  readonly includeCash?: boolean;
  readonly onIncludeCash?: (value: boolean) => void;
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

function parseAmount(text: string): number | null {
  const n = Number(text.replace(/,/g, '').trim());
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT ? n : null;
}

export function CashManager({ entries, includeCash, onIncludeCash }: CashManagerProps) {
  const router = useRouter();
  const { masked } = useMask();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
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
    const value = parseAmount(amount);
    if (!label.trim() || value === null) return setError('Enter a name and an amount of zero or more.');
    if (await run(() => send('/api/cash', 'POST', { label: label.trim(), amount: value }))) {
      setLabel('');
      setAmount('');
    }
  };

  const saveEdit = async (id: string) => {
    const value = parseAmount(editAmount);
    if (value === null) return setError('Enter an amount of zero or more.');
    if (await run(() => send(`/api/cash/${id}`, 'PATCH', { amount: value }))) setEditing(null);
  };

  return (
    <section className={styles.panel} aria-labelledby="cash-title">
      <div className={styles.header}>
        <h2 id="cash-title" className={styles.title}>Cash and liquid funds</h2>
        {onIncludeCash ? (
          <label className={styles.toggle}>
            <input type="checkbox" checked={includeCash ?? false} onChange={(e) => onIncludeCash(e.target.checked)} />
            Show in allocation
          </label>
        ) : null}
      </div>
      <p className={styles.hint}>Money you hold outside these stocks. It makes the mix and the what-if below honest.</p>

      {entries.length > 0 ? (
        <ul className={styles.list}>
          {entries.map((e) => (
            <li key={e.id} className={styles.item}>
              <span className={styles.name}>{e.label}</span>
              {editing === e.id ? (
                <>
                  <input className={styles.input} inputMode="decimal" value={editAmount} onChange={(ev) => setEditAmount(ev.target.value)} aria-label={`Amount for ${e.label}`} />
                  <button type="button" className={styles.primary} disabled={busy} onClick={() => saveEdit(e.id)}>Save</button>
                  <button type="button" className={styles.link} onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <span className={styles.amount}>{formatInr(e.amount, 0, masked)}</span>
                  <button type="button" className={styles.link} onClick={() => { setEditing(e.id); setEditAmount(String(e.amount)); }}>Edit</button>
                  <button type="button" className={styles.danger} disabled={busy} onClick={() => run(() => send(`/api/cash/${e.id}`, 'DELETE'))}>Remove</button>
                </>
              )}
            </li>
          ))}
          <li className={`${styles.item} ${styles.total}`}><span className={styles.name}>Total</span><span className={styles.amount}>{formatInr(totalCash(entries), 0, masked)}</span></li>
        </ul>
      ) : (
        <p className={styles.empty}>No cash recorded yet.</p>
      )}

      <form className={styles.addRow} onSubmit={add}>
        <input className={styles.input} value={label} maxLength={MAX_LABEL} onChange={(e) => setLabel(e.target.value)} placeholder="Name, e.g. Savings account" aria-label="Cash name" />
        <input className={styles.input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (₹)" aria-label="Cash amount" />
        <button type="submit" className={styles.primary} disabled={busy}>Add</button>
      </form>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
