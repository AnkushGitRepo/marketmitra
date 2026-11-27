'use client';

import { useState } from 'react';
import { formatInr } from '@/lib/dashboard/format';
import { useMask } from '@/lib/dashboard/MaskContext';
import { harvestCandidates, lotTax, parseDate, summarise } from '@/lib/tax/india';
import type { TaxReport } from '@/lib/tax/report';
import styles from './TaxPanel.module.css';

interface TaxPanelProps {
  readonly report: TaxReport;
}

const num = (text: string): number => {
  const n = Number(text.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

export function TaxPanel({ report }: TaxPanelProps) {
  const { masked } = useMask();
  const today = parseDate(report.today) as Date;
  const [booked, setBooked] = useState({ short: '', long: '' });
  // Dates the user just saved show at once; the next page load brings them from the server.
  const [dates, setDates] = useState<Readonly<Record<string, string>>>({});
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const lots = report.lots.map((l) => lotTax({ ...l.lot, purchaseDate: dates[l.lot.holdingId] ?? l.lot.purchaseDate }, today));
  const bookedShort = num(booked.short);
  const bookedLong = num(booked.long);
  const summary = summarise(lots, bookedShort, bookedLong);
  const harvest = harvestCandidates(lots, bookedShort, bookedLong);
  const money = (n: number) => formatInr(n, 0, masked);
  const { rules, financialYear } = report;

  const saveDate = async (holdingId: string) => {
    const value = (drafts[holdingId] ?? '').trim();
    setBusyId(holdingId);
    setError(null);
    try {
      const res = await fetch(`/api/holdings/${holdingId}/purchase-date`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseDate: value || null }),
      });
      if (res.ok) setDates((d) => ({ ...d, [holdingId]: value }));
      else setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not save this date.');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="tax-title">
      <div className={styles.header}>
        <h2 id="tax-title" className={styles.title}>Tax awareness</h2>
        <p className={styles.fy}>{financialYear.label} · {financialYear.daysLeft} days to 31 March</p>
      </div>
      <p className={styles.hint}>
        {report.note} Rates: short term {rules.stcgRate * 100}%, long term {rules.ltcgRate * 100}% above {formatInr(rules.ltcgExemption, 0)} a year, as of {rules.asOf}. Long term means held more than {rules.longTermMonths} months.
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

      <dl className={styles.tiles}>
        <div><dt>Unrealised, short term</dt><dd>{money(summary.unrealisedShort)}</dd></div>
        <div><dt>Unrealised, long term</dt><dd>{money(summary.unrealisedLong)}</dd></div>
        <div><dt>Estimated tax on gains booked</dt><dd>{money(summary.taxOnBooked)}</dd></div>
        <div><dt>Change in tax if all were sold today</dt><dd>{money(summary.extraIfSoldToday)}</dd></div>
      </dl>
      {summary.unknownLots > 0 ? <p className={styles.muted}>{summary.unknownLots} holding(s) have no purchase date or price, so they are left out of these numbers. Add a date below.</p> : null}

      {lots.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th scope="col">Holding</th><th scope="col">Bought on</th><th scope="col">Term</th><th scope="col">Long term in</th><th scope="col" className={styles.right}>Unrealised</th></tr>
            </thead>
            <tbody>
              {lots.map((l) => {
                const id = l.lot.holdingId;
                const current = l.lot.purchaseDate ?? '';
                return (
                  <tr key={id}>
                    <th scope="row">{l.lot.symbol}</th>
                    <td>
                      <span className={styles.dateCell}>
                        <input type="date" max={report.today} value={drafts[id] ?? current} onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))} aria-label={`Purchase date for ${l.lot.symbol}`} />
                        {id in drafts && drafts[id] !== current ? (
                          <button type="button" className={styles.save} disabled={busyId === id} onClick={() => saveDate(id)}>Save</button>
                        ) : null}
                      </span>
                    </td>
                    <td>{l.term === null ? 'date missing' : l.term === 'long' ? 'Long term' : 'Short term'}</td>
                    <td>{l.daysToLongTerm === null ? '—' : l.daysToLongTerm === 0 ? 'already' : `${l.daysToLongTerm} days`}</td>
                    <td className={`${styles.right} ${l.gain !== null && l.gain < 0 ? styles.loss : ''}`}>{l.gain === null ? '—' : money(l.gain)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      {harvest.length > 0 ? (
        <div className={styles.harvest}>
          <h3 className={styles.h3}>Positions showing a loss</h3>
          <p className={styles.muted}>A realised loss can offset gains booked in the same financial year. This shows what that would be worth at the rates above; it is not a suggestion to sell.</p>
          <ul>
            {harvest.map((c) => (
              <li key={c.symbol}>
                <strong>{c.symbol}</strong> · {c.term === 'long' ? 'long' : 'short'}-term loss {money(c.loss)} ·{' '}
                {c.taxSaved > 0 ? `would lower your estimated tax by ${money(c.taxSaved)}` : 'no booked gain to offset yet'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
