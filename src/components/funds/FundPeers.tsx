import Link from 'next/link';
import { compareHref } from '@/lib/funds/compare';
import { formatNumber, formatPercent, returnTone } from '@/lib/funds/format';
import type { FundSummary } from '@/lib/funds/types';
import styles from './FundPeers.module.css';

export function FundPeers({ peers, group, currentCode }: { readonly peers: readonly FundSummary[]; readonly group: string | null; readonly currentCode: number }) {
  if (peers.length === 0) return null;
  return (
    <section className={styles.card} aria-label="Peers">
      <h2 className={styles.title}>Peers{group ? ` · ${group}` : ''}</h2>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.fund}>Fund</th>
              <th scope="col">1Y</th>
              <th scope="col">3Y</th>
              <th scope="col">5Y</th>
              <th scope="col">Sharpe</th>
              <th scope="col"><span className={styles.srOnly}>Compare</span></th>
            </tr>
          </thead>
          <tbody>
            {peers.map((peer) => (
              <tr key={peer.scheme_code}>
                <td className={styles.fund}>
                  <Link href={`/funds/${peer.scheme_code}`} className={styles.link} title={peer.name}>
                    {peer.base_name}
                  </Link>
                  <span className={styles.sub}>{peer.fund_house.replace(/ Mutual Fund$/, '')}</span>
                </td>
                {[peer.ret_1y, peer.ret_3y, peer.ret_5y].map((value, i) => (
                  <td key={i} className={returnTone(value) === 'up' ? styles.up : returnTone(value) === 'down' ? styles.down : ''}>
                    {formatPercent(value)}
                  </td>
                ))}
                <td>{formatNumber(peer.sharpe_3y)}</td>
                <td className={styles.action}>
                  <Link className={styles.compare} href={compareHref([currentCode, peer.scheme_code])} aria-label={`Compare this fund with ${peer.base_name}`}>
                    Compare
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
