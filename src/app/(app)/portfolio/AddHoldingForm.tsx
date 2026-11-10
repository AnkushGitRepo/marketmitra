'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import styles from './page.module.css';

export function AddHoldingForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedQuantity = Number(quantity);
    const parsedAvgPrice = Number(avgPrice);
    if (!symbol.trim() || !(parsedQuantity > 0) || !(parsedAvgPrice > 0)) {
      setError('Enter a symbol, a positive quantity, and a positive average price.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.trim().toUpperCase(), quantity: parsedQuantity, avgPrice: parsedAvgPrice }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? 'Could not add that position.');
        return;
      }
      router.refresh();
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.addForm}>
      <input
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        placeholder="NSE symbol, e.g. RELIANCE"
        className={styles.addInput}
      />
      <input
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder="Quantity"
        type="number"
        min="0"
        step="any"
        className={styles.addInput}
      />
      <input
        value={avgPrice}
        onChange={(e) => setAvgPrice(e.target.value)}
        placeholder="Avg. price (₹)"
        type="number"
        min="0"
        step="any"
        className={styles.addInput}
      />
      <button type="submit" disabled={submitting} className={styles.btnPrimary}>
        {submitting ? 'Adding…' : 'Add position'}
      </button>
      {error && <p className={styles.formError}>{error}</p>}
    </form>
  );
}
