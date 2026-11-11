import type { StockSignals } from '@/lib/stock/signals';
import { NOT_AVAILABLE, fmtCrore, fmtPct, fmtSigned, fmtTimes, otherHoldingPct, peBarPositions } from '@/lib/stock/signalFormat';
import styles from './SignalMatrix.module.css';

interface SignalMatrixProps {
  readonly signals: StockSignals;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'gain' | 'loss' }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd className={value === NOT_AVAILABLE ? styles.na : tone ? styles[tone] : undefined}>{value}</dd>
    </div>
  );
}

const tone = (n: number | null): 'gain' | 'loss' | undefined => (n === null ? undefined : n >= 0 ? 'gain' : 'loss');

/** The numbers behind the brief. All computed from data we hold; gaps say "not available". Needs no AI key. */
export function SignalMatrix({ signals: s }: SignalMatrixProps) {
  const pe = peBarPositions(s.valuation.pe, s.valuation.peerMedianPe);
  const own = s.ownership;
  const other = otherHoldingPct(own.promoter?.pct ?? null, own.fii?.pct ?? null, own.dii?.pct ?? null);
  const sent = s.sentiment;
  const neutralPct = sent.positivePct !== null && sent.negativePct !== null ? Math.max(0, 100 - sent.positivePct - sent.negativePct) : null;

  return (
    <div className={styles.root}>
      <section className={styles.block} aria-label="Valuation vs peers">
        <h3 className={styles.title}>Valuation vs peers</h3>
        {pe ? (
          <div className={styles.peBar} role="img" aria-label={`P/E ${fmtTimes(s.valuation.pe)} against a peer median of ${fmtTimes(s.valuation.peerMedianPe)}`}>
            <span className={styles.peTrack} />
            <span className={styles.peMedian} style={{ left: `${pe.median}%` }} title="Peer median P/E" />
            <span className={styles.peDot} style={{ left: `${pe.pe}%` }} title="This stock's P/E" />
          </div>
        ) : null}
        <dl className={styles.list}>
          <Row label="P/E" value={fmtTimes(s.valuation.pe)} />
          <Row label="Peer median P/E" value={fmtTimes(s.valuation.peerMedianPe)} />
          <Row label="P/E vs peers" value={fmtSigned(s.valuation.peVsPeersPct, 0, '%')} />
          <Row label="P/B" value={fmtTimes(s.valuation.pb, 2)} />
        </dl>
        <p className={styles.foot}>5-year median multiples are not in our free data.</p>
      </section>

      <section className={styles.block} aria-label="Quality">
        <h3 className={styles.title}>Quality</h3>
        <dl className={styles.list}>
          <Row label="ROCE" value={fmtPct(s.quality.roce)} />
          <Row label="ROE" value={fmtPct(s.quality.roe)} />
          {s.quality.isFinancial ? (
            <p className={styles.foot}>Debt and free cash flow are not meaningful for a financial company.</p>
          ) : (
            <>
              <Row label="Debt / equity" value={fmtTimes(s.quality.debtToEquity, 2)} />
              <Row label={`Free cash flow${s.quality.freeCashFlow ? ` (${s.quality.freeCashFlow.period.slice(0, 4)})` : ''}`} value={fmtCrore(s.quality.freeCashFlow?.value ?? null)} tone={tone(s.quality.freeCashFlow?.value ?? null)} />
            </>
          )}
        </dl>
      </section>

      <section className={styles.block} aria-label="Growth">
        <h3 className={styles.title}>Growth</h3>
        <dl className={styles.list}>
          <Row label="Sales CAGR (3y)" value={fmtPct(s.growth.salesCagr3y)} tone={tone(s.growth.salesCagr3y)} />
          <Row label="Profit CAGR (3y)" value={fmtPct(s.growth.profitCagr3y)} tone={tone(s.growth.profitCagr3y)} />
          <Row label="Sales, latest qtr YoY" value={fmtSigned(s.growth.qtrSalesYoyPct, 1, '%')} tone={tone(s.growth.qtrSalesYoyPct)} />
          <Row label="Profit, latest qtr YoY" value={fmtSigned(s.growth.qtrProfitYoyPct, 1, '%')} tone={tone(s.growth.qtrProfitYoyPct)} />
        </dl>
      </section>

      <section className={styles.block} aria-label="Smart money">
        <h3 className={styles.title}>Smart money{own.latestQuarter ? ` · ${own.latestQuarter}` : ''}</h3>
        {own.promoter && own.fii && own.dii && other !== null ? (
          <div className={styles.stack} role="img" aria-label={`Promoter ${own.promoter.pct}%, FII ${own.fii.pct}%, DII ${own.dii.pct}%, others ${other.toFixed(1)}%`}>
            <span className={styles.segPromoter} style={{ width: `${own.promoter.pct}%` }} />
            <span className={styles.segFii} style={{ width: `${own.fii.pct}%` }} />
            <span className={styles.segDii} style={{ width: `${own.dii.pct}%` }} />
            <span className={styles.segOther} style={{ width: `${other}%` }} />
          </div>
        ) : null}
        <dl className={styles.list}>
          <Row label="Promoter" value={own.promoter ? `${fmtPct(own.promoter.pct)} (${fmtSigned(own.promoter.delta4q, 1, ' pts / 4q')})` : NOT_AVAILABLE} />
          <Row label="FII" value={own.fii ? `${fmtPct(own.fii.pct)} (${fmtSigned(own.fii.delta1q, 1, ' pts QoQ')})` : NOT_AVAILABLE} tone={tone(own.fii?.delta1q ?? null)} />
          <Row label="DII" value={own.dii ? `${fmtPct(own.dii.pct)} (${fmtSigned(own.dii.delta1q, 1, ' pts QoQ')})` : NOT_AVAILABLE} tone={tone(own.dii?.delta1q ?? null)} />
        </dl>
        <p className={styles.foot}>Pledged shares are not in our free data.</p>
      </section>

      <section className={styles.block} aria-label="News tone">
        <h3 className={styles.title}>News tone</h3>
        {sent.total > 0 && sent.positivePct !== null && sent.negativePct !== null && neutralPct !== null ? (
          <>
            <div className={styles.stack} role="img" aria-label={`${sent.positivePct.toFixed(0)}% positive, ${sent.negativePct.toFixed(0)}% negative of ${sent.total} headlines`}>
              <span className={styles.segPos} style={{ width: `${sent.positivePct}%` }} />
              <span className={styles.segNeutral} style={{ width: `${neutralPct}%` }} />
              <span className={styles.segNeg} style={{ width: `${sent.negativePct}%` }} />
            </div>
            <p className={styles.foot}>
              {sent.positivePct.toFixed(0)}% positive · {sent.negativePct.toFixed(0)}% negative across {sent.total} headlines (automatic headline tone, not analysis).
            </p>
          </>
        ) : (
          <p className={styles.foot}>No recent headlines.</p>
        )}
      </section>

      <section className={styles.block} aria-label="Technical range">
        <h3 className={styles.title}>Technical range</h3>
        <dl className={styles.list}>
          <Row label="vs 52-week high" value={fmtSigned(s.technical.fromHighPct, 1, '%')} tone={tone(s.technical.fromHighPct)} />
          <Row label="vs 200-day average" value={fmtSigned(s.technical.vs200dmPct, 1, '%')} tone={tone(s.technical.vs200dmPct)} />
        </dl>
      </section>
    </div>
  );
}
