'use client';

import { useRouter } from 'next/navigation';
import type { Quote } from '@/lib/dashboard/quotes';
import { CompanyLogo } from './CompanyLogo';
import styles from './MoverPanel.module.css';

export function MoverPanel({ title, rows }: { title: string; rows: Quote[] }) {
  const router = useRouter();

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <p className={styles.title}>{title}</p>
        <span className={styles.today}>Today</span>
      </div>
      <div className={styles.rows}>
        {rows.map((m) => {
          const up = m.changePct >= 0;
          return (
            <button
              key={m.symbol}
              type="button"
              className={styles.row}
              onClick={() => router.push(`/stock/${m.symbol.toLowerCase()}`)}
            >
              <div className={styles.avatar}>
                <CompanyLogo symbol={m.symbol} size={20} />
              </div>
              <div className={styles.info}>
                <p className={styles.name}>{m.name}</p>
                <p className={styles.ticker}>
                  {m.symbol} {m.sector ? `· ${m.sector}` : ''}
                </p>
              </div>
              <div className={styles.priceCol}>
                <p className={styles.price}>₹{m.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                <span className={`${styles.chg} ${up ? styles.chgGain : styles.chgLoss}`}>
                  <span aria-hidden="true">{up ? '▲' : '▼'}</span> {up ? '+' : ''}
                  {m.changePct.toFixed(2)}%
                </span>
              </div>
            </button>
          );
        })}
        {rows.length === 0 && <p className={styles.ticker}>No data available right now.</p>}
      </div>
    </div>
  );
}
