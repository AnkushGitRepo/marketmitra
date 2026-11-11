'use client';

import { useRouter } from 'next/navigation';
import { CompanyLogo } from '@/components/dashboard-charts/CompanyLogo';
import type { Quote } from '@/lib/dashboard/quotes';
import { RowMenu } from './RowMenu';
import { Sparkline } from './Sparkline';
import styles from './WatchlistRow.module.css';

interface WatchlistRowProps {
  readonly symbol: string;
  readonly quote: Quote | undefined;
  readonly spark: readonly number[] | undefined;
  readonly listName: string;
  /** Omitted for managed lists (Holdings), which follow the portfolio and cannot be edited by hand. */
  readonly onRemove?: (symbol: string) => void;
}

export function WatchlistRow({ symbol, quote, spark, listName, onRemove }: WatchlistRowProps) {
  const router = useRouter();
  const up = quote ? quote.changePct >= 0 : true;

  return (
    <div className={`mm-row ${styles.row}`}>
      <button type="button" className={styles.main} onClick={() => router.push(`/stock/${symbol.toLowerCase()}`)}>
        <span className={styles.avatar}>
          <CompanyLogo symbol={symbol} size={20} />
        </span>
        <span className={styles.info}>
          <span className={styles.name}>{quote?.name ?? symbol}</span>
          <span className={styles.ticker}>
            {symbol}
            {quote?.sector ? ` · ${quote.sector}` : ''}
          </span>
        </span>
        <Sparkline values={spark} up={up} className={styles.spark} />
        {quote ? (
          <span className={styles.priceCol}>
            <span className={styles.price}>₹{quote.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            <span className={`${styles.chg} ${up ? styles.gain : styles.loss}`}>
              <span aria-hidden="true">{up ? '▲' : '▼'}</span> {up ? '+' : ''}
              {quote.changePct.toFixed(2)}%
            </span>
          </span>
        ) : (
          <span className={styles.priceCol}>
            <span className={styles.ticker}>No live price</span>
          </span>
        )}
      </button>
      {onRemove && (
        <RowMenu label={`More actions for ${symbol}`} actionLabel={`Remove from ${listName}`} onAction={() => onRemove(symbol)} />
      )}
    </div>
  );
}
