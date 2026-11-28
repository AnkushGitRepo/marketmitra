'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatInr } from '@/lib/dashboard/format';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RowActions } from '@/components/portfolio/RowActions';
import { CompanyLogo } from '@/components/dashboard-charts/CompanyLogo';
import { peakLabel } from '@/lib/portfolio/peak';
import type { PeakSincePurchase } from '@/lib/portfolio/peak';
import { BADGE_LABEL, yearRange } from '@/lib/portfolio/yearRange';
import { stockHref } from '@/lib/stock/href';
import styles from './page.module.css';

interface HoldingRowProps {
  holding: EnrichedHolding;
  totalValue: number;
  masked: boolean;
  /** Highest close since the purchase date, when there is one. */
  peak: PeakSincePurchase | null;
  /** Opens the holding's detail drawer. */
  onOpen: () => void;
}

export function HoldingRow({ holding, totalValue, masked, peak, onOpen }: HoldingRowProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(String(holding.quantity));
  const [avgPrice, setAvgPrice] = useState(String(holding.avgPrice));
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const value = holding.ltp !== null ? holding.quantity * holding.ltp : null;
  const cost = holding.quantity * holding.avgPrice;
  const pl = value !== null ? value - cost : null;
  const plPct = pl !== null && cost ? (pl / cost) * 100 : null;
  const range = yearRange(holding.ltp, holding.week52Low, holding.week52High);
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
      setConfirmRemove(false);
    }
  };

  return (
    <tr
      className={`${styles.row} ${editing ? '' : styles.rowOpenable}`}
      tabIndex={editing ? undefined : 0}
      aria-label={editing ? undefined : `${holding.name}: open details`}
      onClick={(e) => {
        // Links, buttons and fields inside the row keep their own behaviour.
        if (!editing && !(e.target as HTMLElement).closest('a, button, input, select, textarea')) onOpen();
      }}
      onKeyDown={(e) => {
        if (!editing && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <td className={styles.td}>
        <div className={styles.companyCell}>
          <div className={styles.avatar}>
            <CompanyLogo symbol={holding.symbol} size={20} />
          </div>
          <div>
            <p className={styles.companyName}>
              <Link href={stockHref(holding.symbol)} className={styles.companyLink}>
                {holding.name}
              </Link>
            </p>
            <p className={styles.companyMeta}>
              {holding.symbol}
              {holding.sector ? ` · ${holding.sector}` : ''}
            </p>
            {peak ? <p className={styles.peakLine}>{peakLabel(peak, (v) => formatInr(v, 0, masked))}</p> : null}
            {range?.badge ? <span className={`${styles.rangeBadge} ${range.badge === 'near-low' ? styles.rangeLow : styles.rangeHigh}`}>{BADGE_LABEL[range.badge]}</span> : null}
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
          <td className={`${styles.td} ${styles.tdRight}`}>
            {holding.ltp !== null ? formatInr(holding.ltp, 2, masked) : '—'}
            {range ? (
              <div
                className={styles.rangeTrack}
                role="img"
                aria-label={`52-week range: ${formatInr(holding.week52Low ?? 0, 0, masked)} to ${formatInr(holding.week52High ?? 0, 0, masked)}, price at ${Math.round(range.position * 100)}% of the range`}
                title={`52W ${formatInr(holding.week52Low ?? 0, 0, masked)} – ${formatInr(holding.week52High ?? 0, 0, masked)}`}
              >
                <span className={styles.rangeDot} style={{ left: `${range.position * 100}%` }} />
              </div>
            ) : null}
          </td>
          <td className={`${styles.td} ${styles.tdRight}`}>
            {value !== null ? (
              <>
                <p className={styles.valueP}>{formatInr(value, 0, masked)}</p>
                <span className={`${styles.plPill} ${(pl ?? 0) >= 0 ? styles.plGain : styles.plLoss}`}>
                  <span aria-hidden="true">{(pl ?? 0) >= 0 ? '▲' : '▼'}</span> {(pl ?? 0) >= 0 ? '+' : '-'}
                  {Math.abs(plPct ?? 0).toFixed(1)}% · {(pl ?? 0) >= 0 ? '+' : '-'}
                  {formatInr(Math.abs(pl ?? 0), 0, masked)}
                </span>
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
          <RowActions label={holding.symbol} busy={busy} onEdit={() => setEditing(true)} onRemove={() => setConfirmRemove(true)} />
        )}
        <ConfirmDialog
          open={confirmRemove}
          title={`Remove ${holding.symbol}?`}
          message="The holding is removed from your portfolio. Your decision journal keeps its history."
          confirmLabel="Remove holding"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmRemove(false)}
        />
      </td>
    </tr>
  );
}
