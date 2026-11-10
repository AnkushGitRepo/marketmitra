'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatInr } from '@/lib/dashboard/format';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import { CompanyLogo } from '@/components/dashboard-charts/CompanyLogo';
import styles from './page.module.css';

interface HoldingRowProps {
  holding: EnrichedHolding;
  totalValue: number;
  masked: boolean;
}

export function HoldingRow({ holding, totalValue, masked }: HoldingRowProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(String(holding.quantity));
  const [avgPrice, setAvgPrice] = useState(String(holding.avgPrice));
  const [busy, setBusy] = useState(false);

  const value = holding.ltp !== null ? holding.quantity * holding.ltp : null;
  const cost = holding.quantity * holding.avgPrice;
  const pl = value !== null ? value - cost : null;
  const plPct = pl !== null && cost ? (pl / cost) * 100 : null;
  const alloc = value !== null && totalValue ? (value / totalValue) * 100 : 0;

  const save = async () => {
    setBusy(true);
    try {
      await fetch(`/api/holdings/${holding.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: Number(quantity), avgPrice: Number(avgPrice) }),
      });
      router.refresh();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await fetch(`/api/holdings/${holding.id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={styles.row}>
      <td className={styles.td}>
        <div className={styles.companyCell}>
          <div className={styles.avatar}>
            <CompanyLogo symbol={holding.symbol} size={20} />
          </div>
          <div>
            <p className={styles.companyName}>{holding.name}</p>
            <p className={styles.companyMeta}>
              {holding.symbol}
              {holding.sector ? ` · ${holding.sector}` : ''}
            </p>
          </div>
        </div>
      </td>
      {editing ? (
        <>
          <td className={styles.td}>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              type="number"
              className={styles.inlineInput}
            />
          </td>
          <td className={styles.td}>
            <input
              value={avgPrice}
              onChange={(e) => setAvgPrice(e.target.value)}
              type="number"
              className={styles.inlineInput}
            />
          </td>
          <td className={`${styles.td} ${styles.tdRight}`}>{holding.ltp !== null ? formatInr(holding.ltp, 2, masked) : '—'}</td>
          <td className={styles.td} colSpan={2}>
            <button type="button" onClick={save} disabled={busy} className={styles.linkButton}>
              Save
            </button>{' '}
            <button type="button" onClick={() => setEditing(false)} className={styles.linkButton}>
              Cancel
            </button>
          </td>
        </>
      ) : (
        <>
          <td className={`${styles.td} ${styles.tdRight}`}>{holding.quantity}</td>
          <td className={`${styles.td} ${styles.tdRight} ${styles.tdMuted}`}>{formatInr(holding.avgPrice, 2, masked)}</td>
          <td className={`${styles.td} ${styles.tdRight}`}>{holding.ltp !== null ? formatInr(holding.ltp, 2, masked) : '—'}</td>
          <td className={`${styles.td} ${styles.tdRight}`}>
            {value !== null ? (
              <>
                <p className={styles.valueP}>{formatInr(value, 0, masked)}</p>
                <p className={`${styles.plLine} ${(pl ?? 0) >= 0 ? styles.gain : styles.loss}`}>
                  {(pl ?? 0) >= 0 ? '+' : ''}
                  {plPct?.toFixed(1)}% · {(pl ?? 0) >= 0 ? '+' : ''}
                  {formatInr(Math.abs(pl ?? 0), 0, masked)}
                </p>
              </>
            ) : (
              <p className={styles.valueP}>Price unavailable</p>
            )}
          </td>
          <td className={styles.td}>
            <div className={styles.allocCell}>
              <div className={styles.allocBarTrack}>
                <div className={styles.allocBarFill} style={{ width: `${Math.min(100, (alloc / 20) * 100)}%` }} />
              </div>
              <span className={styles.allocLabel}>{alloc.toFixed(1)}%</span>
            </div>
          </td>
        </>
      )}
      <td className={styles.td}>
        {!editing && (
          <>
            <button type="button" onClick={() => setEditing(true)} className={styles.linkButton}>
              Edit
            </button>{' '}
            <button type="button" onClick={remove} disabled={busy} className={styles.linkButtonDanger}>
              Remove
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
