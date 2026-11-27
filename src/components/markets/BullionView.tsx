'use client';

import { useState } from 'react';
import type { CommoditiesData, EtfRow, MetalRate } from '@/lib/commodities/rates';
import { shownPrice, sortEtfs, type EtfSortKey, type SortDir } from '@/lib/commodities/view';
import { formatInr } from '@/lib/dashboard/format';
import { yearRange } from '@/lib/portfolio/yearRange';
import { shortDate } from '@/lib/tax/format';
import styles from './BullionView.module.css';

interface BullionViewProps {
  readonly data: CommoditiesData | null;
}

const SPOT_IDS = ['gold-24k', 'silver-999', 'platinum-999'] as const;

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

function Change({ pct }: { readonly pct: number | null }) {
  if (pct === null) return <span className={styles.flat}>—</span>;
  return <span className={pct >= 0 ? styles.up : styles.down}>{pct >= 0 ? '▲' : '▼'} {signed(pct)}</span>;
}

function RangeBar({ price, low, high, label }: { readonly price: number | null; readonly low: number | null; readonly high: number | null; readonly label: string }) {
  const range = yearRange(price, low, high);
  if (!range || low === null || high === null) return null;
  return (
    <div className={styles.range} role="img" aria-label={`${label} 52-week range: ${formatInr(low, 0)} to ${formatInr(high, 0)}, now at ${Math.round(range.position * 100)}% of it`}>
      <span className={styles.rangeEnd}>{formatInr(low, 0)}</span>
      <span className={styles.track}><span className={styles.dot} style={{ left: `${range.position * 100}%` }} /></span>
      <span className={styles.rangeEnd}>{formatInr(high, 0)}</span>
    </div>
  );
}

/** Gold, silver and platinum, plus the NSE gold and silver ETFs. The prices are estimates and every card says so. */
export function BullionView({ data }: BullionViewProps) {
  const [inclGst, setInclGst] = useState(false);
  const [sort, setSort] = useState<{ key: EtfSortKey; dir: SortDir }>({ key: 'symbol', dir: 'asc' });

  if (!data || data.metals.every((m) => m.priceInr === null)) {
    return <p className={styles.empty}>Metal prices are unavailable right now. The price source did not respond.</p>;
  }

  const byId = new Map(data.metals.map((m) => [m.id, m]));
  const spots = SPOT_IDS.map((id) => byId.get(id)).filter((m): m is MetalRate => m !== undefined);
  const gold22 = byId.get('gold-22k');
  const a = data.assumptions;
  const etfs = sortEtfs(data.etfs, sort.key, sort.dir);
  const pick = (key: EtfSortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const ariaSort = (key: EtfSortKey) => (sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');

  return (
    <div className={styles.wrap}>
      <div className={styles.banner} role="note">
        <p>
          <strong>Estimates, not the official rate.</strong> International prices converted to rupees with India&rsquo;s {a.importDutyPct}% import duty
          (in force since {shortDate(a.dutyEffectiveFrom)}, last confirmed {shortDate(a.dutyCheckedOn)}). Not the IBJA or MCX rate; the Indian price can differ
          by making charges and local premium.
        </p>
        {a.dutyStale ? <p className={styles.stale}>The duty has not been confirmed for over 45 days, so these figures may be off if it has changed.</p> : null}
      </div>

      <div className={styles.toolbar}>
        <label className={styles.gst}>
          <input type="checkbox" checked={inclGst} onChange={(e) => setInclGst(e.target.checked)} /> Include {a.gstPct}% GST
        </label>
        {data.goldSilverRatio !== null ? (
          <span className={styles.ratio} title="How many kilograms of silver one kilogram of gold is worth, at these prices">
            Gold-to-silver ratio <strong>{data.goldSilverRatio.toFixed(1)}x</strong>
          </span>
        ) : null}
      </div>

      <div className={styles.cards}>
        {spots.map((m) => {
          const price = shownPrice(m.priceInr, inclGst);
          return (
            <section key={m.id} className={styles.card} aria-label={m.label}>
              <p className={styles.cardLabel}>{m.label}</p>
              <p className={styles.price}>{price === null ? '—' : formatInr(price, 0)} <span className={styles.unit}>/ {m.unit}</span></p>
              <p className={styles.metaRow}><Change pct={m.changePct} /> <span className={styles.flat}>today, futures</span></p>
              {m.id === 'gold-24k' && gold22 && gold22.priceInr !== null ? (
                <p className={styles.sub}>22K (916): {formatInr(shownPrice(gold22.priceInr, inclGst) ?? 0, 0)} / {gold22.unit}</p>
              ) : null}
              <RangeBar price={m.priceInr} low={m.week52LowInr} high={m.week52HighInr} label={m.label} />
              <p className={styles.note}>{m.note}</p>
            </section>
          );
        })}
      </div>

      <section className={styles.tableCard} aria-label="NSE gold and silver ETFs">
        <h2 className={styles.h2}>Gold and silver ETFs on NSE</h2>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th aria-sort={ariaSort('symbol')}><button type="button" className={styles.sortBtn} onClick={() => pick('symbol')}>ETF</button></th>
                <th className={styles.right} aria-sort={ariaSort('price')}><button type="button" className={styles.sortBtn} onClick={() => pick('price')}>Price</button></th>
                <th className={styles.right} aria-sort={ariaSort('change')}><button type="button" className={styles.sortBtn} onClick={() => pick('change')}>Today</button></th>
                <th className={styles.right}>52-week range</th>
              </tr>
            </thead>
            <tbody>
              {etfs.map((e: EtfRow) => (
                <tr key={e.symbol}>
                  <td><p className={styles.etfName}>{e.name}</p><p className={styles.etfSym}>{e.symbol} · {e.metal}</p></td>
                  <td className={styles.right}>{e.price === null ? '—' : formatInr(e.price, 2)}</td>
                  <td className={styles.right}><Change pct={e.changePct} /></td>
                  <td className={styles.right}><RangeBar price={e.price} low={e.week52Low} high={e.week52High} label={e.symbol} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>1-year return, expense ratio and AUM are not shown: the price feed does not carry them.</p>
      </section>
    </div>
  );
}
