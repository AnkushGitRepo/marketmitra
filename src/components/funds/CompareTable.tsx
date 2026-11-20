import Link from 'next/link';
import { bestByRow, compareHref, COMPARE_ROWS } from '@/lib/funds/compare';
import { formatDate, formatNav } from '@/lib/funds/format';
import type { FundDetail } from '@/lib/funds/types';
import styles from './CompareTable.module.css';

/** The funds side by side. The winner of a row is marked; a tie or a missing figure never wins. */
export function CompareTable({ funds }: { readonly funds: readonly FundDetail[] }) {
  const best = bestByRow(funds);
  // A row where nobody has a figure would be a line of dashes; leave it out.
  const rows = COMPARE_ROWS.filter((row) => funds.some((fund) => row.read(fund) !== null));
  const codes = funds.map((f) => f.scheme_code);

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={`${styles.th} ${styles.rowHead}`}><span className={styles.srOnly}>Measure</span></th>
            {funds.map((fund) => (
              <th key={fund.scheme_code} scope="col" className={styles.th}>
                <Link href={`/funds/${fund.scheme_code}`} className={styles.fundName}>{fund.base_name}</Link>
                <span className={styles.sub}>{fund.fund_house.replace(/ Mutual Fund$/, '')} · {fund.sub_category ?? fund.category}</span>
                <span className={styles.sub}>NAV {formatNav(fund.nav)} · {formatDate(fund.nav_date)}</span>
                {funds.length > 2 && (
                  <Link className={styles.drop} href={compareHref(codes.filter((c) => c !== fund.scheme_code))}>Remove</Link>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className={`${styles.td} ${styles.rowHead}`}>{row.label}</th>
              {funds.map((fund) => {
                const { text, tone } = row.render(fund);
                const wins = best[row.key] === fund.scheme_code;
                return (
                  <td key={fund.scheme_code} className={`${styles.td} ${wins ? styles.win : ''}`}>
                    <span className={tone === 'up' ? styles.up : tone === 'down' ? styles.down : ''}>{text}</span>
                    {wins && <span className={styles.best}>Best</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
