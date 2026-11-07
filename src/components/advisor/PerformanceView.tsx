import type { PaperReport } from '@/lib/advisor/performance/paper';
import styles from './advisor.module.css';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const sgn = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

export function PerformanceView({ report, benchmark }: { report: PaperReport; benchmark: string }) {
  const t = report.totals;
  return (
    <>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Performance · as of {report.asOf}</p>
          <h1 className={styles.h1}>Advisor sleeve vs Nifty 50 fund</h1>
        </div>
      </div>
      <p className={styles.muted}>
        Each recorded stock recommendation is treated as a paper purchase at that day’s closing price, and compared
        with the same rupees put into {benchmark} (a Nifty 50 index fund) on the same day. This is forward tracking
        only — there is no backtest — so the numbers are as unflattering as the record. Ignored recommendations are
        included: the question is how good the suggestions were.
      </p>

      <p className={report.warning.status === 'trailing' ? styles.error : styles.note} role={report.warning.status === 'trailing' ? 'alert' : undefined}>
        {report.warning.status === 'trailing' ? '⚠ ' : ''}
        {report.warning.message}
      </p>

      {report.entries.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.muted}>No recommendations recorded yet. Record one from a research memo and it will be tracked here.</p>
        </div>
      ) : (
        <>
          <div className={styles.card}>
            <h2 className={styles.h2}>Totals</h2>
            <ul className={styles.lines}>
              <li className={styles.line}>
                <span className={styles.tag}>Invested</span>
                <span className={styles.lineTarget}>Paper money in</span>
                <span className={styles.lineAmount}>{inr(t.investedINR)}</span>
              </li>
              <li className={styles.line}>
                <span className={styles.tag}>Sleeve</span>
                <span className={styles.lineTarget}>Advisor stock picks</span>
                <span className={styles.lineAmount}>{inr(t.sleeveValueINR)}{t.sleeveReturnPct !== null && ` (${sgn(t.sleeveReturnPct)})`}</span>
                {t.sleeveXirrPct !== null && <span className={styles.lineRule}>Annualised: {sgn(t.sleeveXirrPct)}</span>}
              </li>
              <li className={styles.line}>
                <span className={styles.tag}>Index</span>
                <span className={styles.lineTarget}>Same rupees in {benchmark}</span>
                <span className={styles.lineAmount}>{inr(t.benchmarkValueINR)}{t.benchmarkReturnPct !== null && ` (${sgn(t.benchmarkReturnPct)})`}</span>
                {t.benchmarkXirrPct !== null && <span className={styles.lineRule}>Annualised: {sgn(t.benchmarkXirrPct)}</span>}
              </li>
              <li className={styles.line}>
                <span className={styles.tag}>Gap</span>
                <span className={styles.lineTarget}>Sleeve minus index</span>
                <span className={styles.lineAmount}>{t.excessPts !== null ? `${t.excessPts >= 0 ? '+' : ''}${t.excessPts.toFixed(1)} pts` : 'n/a'}</span>
              </li>
            </ul>
            {t.unpriced > 0 && <p className={styles.note}>{t.unpriced} recommendation(s) could not be priced and are left out of these totals.</p>}
            {t.sleeveXirrPct === null && <p className={styles.note}>Annualised returns appear after a year of history; shorter spans mislead.</p>}
          </div>

          <div className={styles.card}>
            <h2 className={styles.h2}>Each recommendation</h2>
            <ul className={styles.lines}>
              {report.entries.map((e) => (
                <li key={e.id} className={styles.line}>
                  <span className={styles.tag}>{e.symbol}</span>
                  <span className={styles.lineTarget}>{e.name} · {e.entryDate}</span>
                  <span className={styles.lineAmount}>{e.returnPct !== null ? sgn(e.returnPct) : 'n/a'}</span>
                  <span className={styles.lineRule}>
                    {e.benchmarkReturnPct !== null && e.excessPts !== null
                      ? `Index over the same days: ${sgn(e.benchmarkReturnPct)} · ${e.excessPts >= 0 ? 'ahead' : 'behind'} by ${Math.abs(e.excessPts).toFixed(1)} pts · ${e.daysHeld} days`
                      : 'Price history unavailable for this symbol or date.'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {report.series.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.h2}>Month by month</h2>
              <table className={styles.table}>
                <thead>
                  <tr><th>Date</th><th>Invested</th><th>Sleeve</th><th>Index</th><th>Gap</th></tr>
                </thead>
                <tbody>
                  {report.series.map((r) => (
                    <tr key={r.date} className={r.excessPts < 0 ? styles.losing : undefined}>
                      <td>{r.date}</td>
                      <td>{inr(r.investedINR)}</td>
                      <td>{sgn(r.sleeveReturnPct)}</td>
                      <td>{sgn(r.benchmarkReturnPct)}</td>
                      <td>{r.excessPts >= 0 ? '+' : ''}{r.excessPts.toFixed(1)} pts</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.note}>Shaded rows are months when the stock sleeve was behind the index.</p>
            </div>
          )}
        </>
      )}
    </>
  );
}
