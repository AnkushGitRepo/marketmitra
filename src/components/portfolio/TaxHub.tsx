'use client';

import { useState } from 'react';
import { formatInr } from '@/lib/dashboard/format';
import { useMask } from '@/lib/dashboard/MaskContext';
import { LTCG_RATE, STCG_RATE, lotTax, parseDate } from '@/lib/tax/india';
import { LONG_TERM_SOON_DAYS, allowanceCard, harvestPool, longTermSoon, lotTag, unrealisedSplit, yearProgressPct, type LotTag } from '@/lib/tax/ledger';
import { shortDate } from '@/lib/tax/format';
import type { TaxReport } from '@/lib/tax/report';
import styles from './TaxHub.module.css';

interface TaxHubProps {
  readonly report: TaxReport;
}

const num = (text: string): number => {
  const n = Number(text.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

function tagText(tag: LotTag): string | null {
  switch (tag.kind) {
    case 'date_missing': return 'Add the buy date';
    case 'loss': return `Loss position · ${tag.term}-term`;
    case 'long_term_soon': return `Long term in ${tag.days} day${tag.days === 1 ? '' : 's'}`;
    case 'within_allowance': return 'Within the tax-free allowance';
    case 'none': return null;
  }
}

/** The tax and harvesting page body: four headline cards and a lot-wise ledger. An estimate, not tax advice. */
export function TaxHub({ report }: TaxHubProps) {
  const { masked } = useMask();
  const today = parseDate(report.today) as Date;
  const [booked, setBooked] = useState({ short: '', long: '' });
  const [dates, setDates] = useState<Readonly<Record<string, string>>>({});
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // A date the user just saved shows at once; the next load brings it from the server.
  const lots = report.lots.map((l) => lotTax({ ...l.lot, purchaseDate: dates[l.lot.holdingId] ?? l.lot.purchaseDate }, today));
  const bookedShort = num(booked.short);
  const bookedLong = num(booked.long);
  const allowance = allowanceCard(lots, bookedLong);
  const split = unrealisedSplit(lots);
  const pool = harvestPool(lots, bookedShort, bookedLong);
  const soon = longTermSoon(lots);
  const undated = lots.filter((l) => l.term === null).length;
  const money = (n: number) => formatInr(n, 0, masked);
  const { rules, financialYear } = report;

  const saveDate = async (holdingId: string) => {
    const value = (drafts[holdingId] ?? '').trim();
    setBusyId(holdingId);
    setError(null);
    try {
      const res = await fetch(`/api/holdings/${holdingId}/purchase-date`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchaseDate: value || null }) });
      if (res.ok) setDates((d) => ({ ...d, [holdingId]: value }));
      else setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not save this date.');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={styles.root}>
      <p className={styles.fy}>{financialYear.label} · {financialYear.daysLeft} days to 31 March</p>
      <p className={styles.note}>
        {report.note} Short-term gains are taxed at {rules.stcgRate * 100}% and long-term gains at {rules.ltcgRate * 100}% above {formatInr(rules.ltcgExemption, 0)} a year, as of {rules.asOf}. Long term means held more than {rules.longTermMonths} months.
      </p>

      <div className={styles.booked}>
        <label className={styles.field}>
          <span>Short-term gains already booked this year (₹, a loss is negative)</span>
          <input inputMode="decimal" value={booked.short} onChange={(e) => setBooked((b) => ({ ...b, short: e.target.value }))} placeholder="0" />
        </label>
        <label className={styles.field}>
          <span>Long-term gains already booked this year (₹)</span>
          <input inputMode="decimal" value={booked.long} onChange={(e) => setBooked((b) => ({ ...b, long: e.target.value }))} placeholder="0" />
        </label>
      </div>

      <div className={styles.kpis}>
        <section className={styles.card} aria-label="Long-term tax-free allowance">
          <h2 className={styles.cardTitle}>Long-term tax-free allowance</h2>
          <p className={styles.big}>{money(allowance.remaining)} <span className={styles.small}>left of {money(allowance.allowance)}</span></p>
          <div className={styles.bar} role="img" aria-label={`${money(allowance.booked)} booked and ${money(allowance.unrealised)} unrealised of ${money(allowance.allowance)}`}>
            <span className={styles.barBooked} style={{ width: `${allowance.bookedPct}%` }} />
            <span className={styles.barUnrealised} style={{ width: `${allowance.unrealisedPct}%` }} />
          </div>
          <p className={styles.small}>Booked {money(allowance.booked)} · unrealised on your lots {money(allowance.unrealised)}</p>
        </section>

        <section className={styles.card} aria-label="Unrealised gains by holding period">
          <h2 className={styles.cardTitle}>Unrealised, short vs long term</h2>
          <p className={styles.big}>{money(split.total)}</p>
          <p className={styles.small}>Short term (taxed at {STCG_RATE * 100}%): <strong>{money(split.short)}</strong></p>
          <p className={styles.small}>Long term (taxed at {LTCG_RATE * 100}%): <strong>{money(split.long)}</strong></p>
        </section>

        <section className={styles.card} aria-label="Losses that could offset gains">
          <h2 className={styles.cardTitle}>Losses that could offset gains</h2>
          <p className={styles.big}>{money(pool.loss)} <span className={styles.small}>across {pool.lots} position{pool.lots === 1 ? '' : 's'}</span></p>
          <p className={styles.small}>
            {pool.taxShield > 0 ? <>Realised, they would lower your estimated tax by <strong>{money(pool.taxShield)}</strong>.</> : 'Enter the gains you have booked above to see what they would be worth.'}
          </p>
        </section>

        <section className={styles.card} aria-label="Turning long term soon">
          <h2 className={styles.cardTitle}>Turning long term within {LONG_TERM_SOON_DAYS} days</h2>
          <p className={styles.big}>{soon.lots} <span className={styles.small}>lot{soon.lots === 1 ? '' : 's'}</span></p>
          <p className={styles.small}>{soon.rateGap > 0 ? <>Their gains would be taxed {money(soon.rateGap)} less at the long-term rate.</> : 'No gain is close to the long-term rate.'}</p>
        </section>
      </div>

      {undated > 0 ? <p className={styles.note}>{undated} holding{undated === 1 ? ' has' : 's have'} no buy date or price, so {undated === 1 ? 'it is' : 'they are'} left out of the figures above. Add the date in the ledger.</p> : null}

      <section className={styles.ledger} aria-label="Lot-wise tax ledger">
        <h2 className={styles.cardTitle}>Lot-wise ledger</h2>
        {lots.length === 0 ? (
          <p className={styles.small}>No holdings yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Stock</th><th scope="col">Bought on</th><th scope="col">Holding period</th><th scope="col">Class</th><th scope="col" className={styles.right}>Unrealised</th><th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => {
                  const id = l.lot.holdingId;
                  const current = l.lot.purchaseDate ?? '';
                  const progress = yearProgressPct(l);
                  const text = tagText(lotTag(l, allowance));
                  return (
                    <tr key={id}>
                      <th scope="row">{l.lot.symbol}</th>
                      <td>
                        <span className={styles.dateCell}>
                          <input type="date" max={report.today} value={drafts[id] ?? current} onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))} aria-label={`Buy date for ${l.lot.symbol}`} />
                          {id in drafts && drafts[id] !== current ? <button type="button" className={styles.save} disabled={busyId === id} onClick={() => saveDate(id)}>Save</button> : null}
                        </span>
                        {current ? <span className={styles.small}>{shortDate(current)}</span> : null}
                      </td>
                      <td>
                        {progress === null ? '—' : (
                          <span className={styles.period}>
                            <span className={styles.track} role="img" aria-label={`${Math.round(progress)}% of the way to long term`}><span className={styles.fill} style={{ width: `${progress}%` }} /></span>
                            <span className={styles.small}>{l.heldDays} days{l.daysToLongTerm ? ` · long term in ${l.daysToLongTerm}` : ' · long term'}</span>
                          </span>
                        )}
                      </td>
                      <td>{l.term === null ? '—' : l.term === 'long' ? `Long term ${LTCG_RATE * 100}%` : `Short term ${STCG_RATE * 100}%`}</td>
                      <td className={`${styles.right} ${l.gain !== null && l.gain < 0 ? styles.loss : ''}`}>{l.gain === null ? '—' : money(l.gain)}</td>
                      <td>{text ? <span className={styles.tag}>{text}</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
