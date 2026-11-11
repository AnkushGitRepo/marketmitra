import Link from 'next/link';
import type { PeerOut } from '@/lib/dashboard/fundamentalsApi';
import styles from './DeepDive.module.css';

type Kind = 'inr' | 'inr_cr' | 'pct' | 'x';

function fmt(value: string | null, kind: Kind): string {
  if (value === null) return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  if (kind === 'inr') return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  if (kind === 'inr_cr') return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
  if (kind === 'x') return `${num.toFixed(1)}x`;
  return `${num.toFixed(2)}%`;
}

const COLUMNS: ReadonlyArray<{ key: keyof PeerOut; label: string; kind: Kind }> = [
  { key: 'cmp', label: 'CMP', kind: 'inr' },
  { key: 'pe', label: 'P/E', kind: 'x' },
  { key: 'market_cap', label: 'Mkt cap', kind: 'inr_cr' },
  { key: 'div_yield', label: 'Div yield', kind: 'pct' },
  { key: 'net_profit_qtr', label: 'NP qtr', kind: 'inr_cr' },
  { key: 'qtr_profit_var_pct', label: 'Qtr profit var', kind: 'pct' },
  { key: 'roce_pct', label: 'ROCE', kind: 'pct' },
];

function PeerName({ peer }: { peer: PeerOut }) {
  return peer.is_target ? (
    <>
      {peer.name} <span className={styles.note}>· this stock</span>
    </>
  ) : (
    <Link href={`/stock/${peer.symbol}`} className={styles.peerLink}>
      {peer.name}
    </Link>
  );
}

/** A comparison table on desktop, one compact card per company on a phone. */
export function PeersPanel({ peers }: { readonly peers: PeerOut[] }) {
  if (peers.length === 0) return <p className={styles.note}>Peer comparison isn&rsquo;t available for this company right now.</p>;
  return (
    <>
      <div className={`${styles.tableScroll} ${styles.peersTable}`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.stickyHead}>
                Company
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" className={styles.numHead}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {peers.map((p) => (
              <tr key={p.symbol} className={p.is_target ? styles.targetRow : undefined}>
                <th scope="row" className={styles.stickyCell}>
                  <PeerName peer={p} />
                </th>
                {COLUMNS.map((c) => (
                  <td key={c.key} className={styles.numCell}>
                    {fmt(p[c.key] as string | null, c.kind)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={styles.peerCards} aria-label="Peer comparison">
        {peers.map((p) => (
          <li key={p.symbol} className={`${styles.peerCard} ${p.is_target ? styles.targetCard : ''}`}>
            <p className={styles.peerCardName}>
              <PeerName peer={p} />
            </p>
            <dl className={styles.peerStats}>
              {COLUMNS.slice(0, 4).map((c) => (
                <div key={c.key}>
                  <dt>{c.label}</dt>
                  <dd>{fmt(p[c.key] as string | null, c.kind)}</dd>
                </div>
              ))}
              <div>
                <dt>ROCE</dt>
                <dd>{fmt(p.roce_pct, 'pct')}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
