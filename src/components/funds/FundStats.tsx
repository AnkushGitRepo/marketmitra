import { DASH, formatAum, formatDate, formatNumber, formatPercent, returnTone, type Tone } from '@/lib/funds/format';
import type { FundDetail } from '@/lib/funds/types';
import styles from './FundStats.module.css';

interface Row {
  readonly term: string;
  readonly text: string;
  readonly tone?: Tone;
}

function StatCard({ title, rows, hint }: { readonly title: string; readonly rows: readonly Row[]; readonly hint?: string }) {
  return (
    <section className={styles.card} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>
      <dl className={styles.list}>
        {rows.map((row) => (
          <div key={row.term} className={styles.row}>
            <dt className={styles.term}>{row.term}</dt>
            <dd
              className={`${styles.value} ${row.tone === 'up' ? styles.up : row.tone === 'down' ? styles.down : ''} ${row.text === DASH ? styles.missing : ''}`}
            >
              {row.text}
            </dd>
          </div>
        ))}
      </dl>
      {hint && <p className={styles.hint}>{hint}</p>}
    </section>
  );
}

const pct = (term: string, value: number | null): Row => ({ term, text: formatPercent(value), tone: returnTone(value) });

export function FundStats({ fund }: { readonly fund: FundDetail }) {
  const sheet = fund.factsheet;
  const factRows: Row[] = [
    { term: 'Expense ratio', text: sheet?.expense_ratio == null ? DASH : `${formatNumber(sheet.expense_ratio)}%` },
    { term: 'AUM', text: formatAum(sheet?.aum_cr ?? null) },
    { term: 'Exit load', text: sheet?.exit_load || DASH },
    { term: 'Fund manager', text: sheet?.fund_manager || DASH },
    { term: 'Benchmark', text: sheet?.benchmark || DASH },
    { term: 'Launched', text: formatDate(sheet?.launch_date ?? null) },
  ];

  return (
    <div className={styles.grid}>
      <StatCard
        title="Returns"
        rows={[
          pct('1 month', fund.ret_1m),
          pct('3 months', fund.ret_3m),
          pct('6 months', fund.ret_6m),
          pct('1 year', fund.ret_1y),
          pct('3 years (annualised)', fund.ret_3y),
          pct('5 years (annualised)', fund.ret_5y),
          pct('10 years (annualised)', fund.ret_10y),
        ]}
        hint="Under a year is the plain change in NAV; a year or more is the compound annual rate."
      />
      <StatCard
        title="SIP returns"
        rows={[pct('3-year SIP (XIRR)', fund.sip_xirr_3y), pct('5-year SIP (XIRR)', fund.sip_xirr_5y)]}
        hint="A fixed monthly amount invested over the period, with each instalment priced at that day's NAV."
      />
      <StatCard
        title="Risk (3 years)"
        rows={[
          { term: 'Volatility', text: fund.std_dev_3y === null ? DASH : `${formatNumber(fund.std_dev_3y, 1)}%` },
          { term: 'Sharpe ratio', text: formatNumber(fund.sharpe_3y) },
          { term: 'Sortino ratio', text: formatNumber(fund.sortino_3y) },
          pct('Worst fall (max drawdown)', fund.max_drawdown_3y),
        ]}
        hint="Sharpe and Sortino measure return above a 6.5% risk-free rate per unit of risk. Our own calculation from daily NAV."
      />
      <StatCard
        title="Fund details"
        rows={factRows}
        hint={
          sheet
            ? `From ${sheet.source}${sheet.as_of ? `, as of ${formatDate(sheet.as_of)}` : ''}.`
            : 'Not available yet: these details are published by each fund house and have not been loaded for this fund.'
        }
      />
    </div>
  );
}
