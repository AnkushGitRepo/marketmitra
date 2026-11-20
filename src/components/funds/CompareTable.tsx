import Link from 'next/link';
import type { ReactNode } from 'react';
import { bestByRow, compareHref, COMPARE_GROUPS, COMPARE_ROWS } from '@/lib/funds/compare';
import { fitCell, type FundFit } from '@/lib/funds/compareFit';
import { formatDate, formatNav } from '@/lib/funds/format';
import type { FundDetail } from '@/lib/funds/types';
import styles from './CompareTable.module.css';

interface CompareTableProps {
  readonly funds: readonly FundDetail[];
  /** Each fund's fit against the portfolio, or null when the portfolio gives none (the row is then left out). */
  readonly fits: readonly FundFit[] | null;
  /** Shown in an empty column while fewer than three funds are picked. */
  readonly addSlot?: ReactNode;
}

/**
 * The funds side by side, in three groups. The winner of a row is marked; a tie or a missing figure never wins.
 * The fit row states the portfolio's weight in each fund's sector and is never marked best or worst.
 */
export function CompareTable({ funds, fits, addSlot }: CompareTableProps) {
  const best = bestByRow(funds);
  const codes = funds.map((f) => f.scheme_code);
  const fitByCode = new Map((fits ?? []).map((fit) => [fit.code, fit]));
  const columns = funds.length + 1 + (addSlot ? 1 : 0);

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
                <Link className={styles.drop} href={compareHref(codes.filter((c) => c !== fund.scheme_code))}>Remove</Link>
              </th>
            ))}
            {addSlot && <th scope="col" className={`${styles.th} ${styles.slot}`}>{addSlot}</th>}
          </tr>
        </thead>
        {COMPARE_GROUPS.map((group) => {
          // A row where nobody has a figure would be a line of dashes; leave it out.
          const rows = COMPARE_ROWS.filter((row) => row.group === group.id && funds.some((fund) => row.read(fund) !== null));
          const showFit = group.id === 'cost' && fits !== null;
          if (rows.length === 0 && !showFit) return null;
          return (
            <tbody key={group.id}>
              <tr>
                <th scope="rowgroup" colSpan={columns} className={styles.groupHead}>{group.title}</th>
              </tr>
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
                  {addSlot && <td className={`${styles.td} ${styles.slotCell}`} />}
                </tr>
              ))}
              {showFit && (
                <tr>
                  <th scope="row" className={`${styles.td} ${styles.rowHead}`}>Your portfolio in its sector</th>
                  {funds.map((fund) => {
                    const fit = fitByCode.get(fund.scheme_code);
                    const cell = fit ? fitCell(fit) : null;
                    return (
                      <td key={fund.scheme_code} className={styles.td}>
                        {cell && (
                          <>
                            <span>{cell.text}</span>
                            {cell.detail && <span className={styles.fitDetail}>{cell.detail}</span>}
                          </>
                        )}
                      </td>
                    );
                  })}
                  {addSlot && <td className={`${styles.td} ${styles.slotCell}`} />}
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
