'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseNavSeries } from '@/lib/funds/chart';
import { formatDate, formatPercent } from '@/lib/funds/format';
import { buildRace, buildRaceChart, RACE_BASE, RACE_WINDOWS, type RaceInput, type RaceWindowId } from '@/lib/funds/growthRace';
import type { NavPoint } from '@/lib/funds/types';
import styles from './GrowthRace.module.css';

interface GrowthRaceProps {
  readonly funds: readonly { readonly code: number; readonly name: string }[];
}

const WIDTH = 720;
const HEIGHT = 280;
const PAD = 24;
const PAD_LEFT = 104;
/** Below this many pixels between the ₹10,000 line and the bottom of the plot, the two labels would touch. */
const MIN_LABEL_GAP = 16;

const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

type Loaded = readonly NavPoint[] | 'failed';

/** What ₹10,000 put into each compared fund would have become: one line per fund, from the same start date. */
export function GrowthRace({ funds }: GrowthRaceProps) {
  const [windowId, setWindowId] = useState<RaceWindowId>('3y');
  // One fetch of each fund's whole history serves every period (and avoids a period looking too short because one
  // fund's latest NAV is a few days newer than another's, which a per-period range would).
  const [store, setStore] = useState<Readonly<Record<number, Loaded>>>({});
  const [attempt, setAttempt] = useState(0);
  const requested = useRef(new Set<number>());

  useEffect(() => {
    for (const fund of funds) {
      if (requested.current.has(fund.code)) continue;
      requested.current.add(fund.code);
      // Not aborted on cleanup: React runs this effect twice in development, and the second run must not re-fetch
      // what the first already started. A late answer for funds that have since changed is dropped when the
      // component remounts (it is keyed by the funds).
      void (async () => {
        let result: Loaded = 'failed';
        try {
          const response = await fetch(`/api/funds/${fund.code}/nav?range=max`);
          const parsed = response.ok ? parseNavSeries(await response.json()) : null;
          if (parsed) result = parsed;
        } catch {
          // result stays "failed"; the card says so and offers a retry
        }
        // A failure is forgotten, so "Try again" can fetch it again.
        if (result === 'failed') requested.current.delete(fund.code);
        setStore((prev) => ({ ...prev, [fund.code]: result }));
      })();
    }
  }, [funds, attempt]);

  const retry = () => {
    setStore((prev) => Object.fromEntries(Object.entries(prev).filter(([, value]) => value !== 'failed')));
    setAttempt((n) => n + 1);
  };

  const period = RACE_WINDOWS.find((w) => w.id === windowId) ?? RACE_WINDOWS[1];
  const loaded = funds.map((f) => store[f.code]);
  const failed = loaded.some((l) => l === 'failed');
  const ready = loaded.every((l) => l !== undefined && l !== 'failed');

  const race = useMemo(() => {
    const series = funds.map((f) => store[f.code]);
    if (!series.every((s): s is readonly NavPoint[] => s !== undefined && s !== 'failed')) return null;
    const inputs: RaceInput[] = funds.map((f, i) => ({ code: f.code, name: f.name, series: series[i] as readonly NavPoint[] }));
    return buildRace(inputs, period.days);
  }, [funds, store, period.days]);

  const chart = race?.ok ? buildRaceChart(race, WIDTH, HEIGHT, PAD, PAD_LEFT) : null;

  return (
    <section className={styles.card} aria-label="Growth of ₹10,000">
      <div className={styles.head}>
        <h2 className={styles.title}>Growth of ₹10,000</h2>
        <div className={styles.windows} role="group" aria-label="Period">
          {RACE_WINDOWS.map((w) => (
            <button key={w.id} type="button" className={`${styles.window} ${w.id === windowId ? styles.active : ''}`} aria-pressed={w.id === windowId} onClick={() => setWindowId(w.id)}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <p className={styles.error} role="alert">
          Could not load the NAV history. <button type="button" className={styles.retry} onClick={retry}>Try again</button>
        </p>
      )}
      {!failed && !ready && <p className={styles.empty}>Loading…</p>}
      {race && !race.ok && (
        <p className={styles.empty}>
          {race.reason === 'too_young'
            ? `${race.names.join(' and ')} ${race.names.length > 1 ? 'have' : 'has'} less than ${period.label.replace('Y', '')} ${period.label === '1Y' ? 'year' : 'years'} of history, so this period cannot be compared. Try a shorter one.`
            : `${race.names.join(' and ')} has no NAV history stored yet.`}
        </p>
      )}

      {race?.ok && chart && (
        <>
          <svg className={styles.svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`₹10,000 invested on ${formatDate(race.start)}: ${race.lines.map((l) => `${l.name} became ${rupees(l.final)}`).join('; ')}`}>
            {/* The top and bottom labels are dropped when they would sit on the ₹10,000 one (no fund rose, or none fell, below its start). */}
            {chart.baseY - PAD > MIN_LABEL_GAP && (
              <text className={styles.axis} x={PAD_LEFT - 8} y={PAD + 4} textAnchor="end">{rupees(chart.max)}</text>
            )}
            {HEIGHT - PAD - chart.baseY > MIN_LABEL_GAP && (
              <text className={styles.axis} x={PAD_LEFT - 8} y={HEIGHT - PAD + 4} textAnchor="end">{rupees(chart.min)}</text>
            )}
            <line className={styles.base} x1={PAD_LEFT} x2={WIDTH - PAD} y1={chart.baseY} y2={chart.baseY} />
            <text className={styles.axis} x={PAD_LEFT - 8} y={chart.baseY + 4} textAnchor="end">{rupees(RACE_BASE)}</text>
            <text className={styles.axis} x={PAD_LEFT} y={HEIGHT - 6}>{formatDate(race.start)}</text>
            <text className={styles.axis} x={WIDTH - PAD} y={HEIGHT - 6} textAnchor="end">{formatDate(race.end)}</text>
            {chart.paths.map((p, i) => (
              <path key={p.code} className={`${styles.line} ${styles[`line${i % 3}`]}`} d={p.d} />
            ))}
          </svg>
          <ul className={styles.legend}>
            {race.lines.map((line, i) => (
              <li key={line.code} className={styles.legendItem}>
                <svg className={styles.swatch} viewBox="0 0 28 8" aria-hidden="true">
                  <line className={`${styles.line} ${styles[`line${i % 3}`]}`} x1="0" x2="28" y1="4" y2="4" />
                </svg>
                <span className={styles.name}>{line.name}</span>
                <span className={styles.final}>{rupees(line.final)}</span>
                <span className={line.changePct >= 0 ? styles.up : styles.down}>{formatPercent(line.changePct)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className={styles.note}>A look back from the same start date, not a forecast. NAV only: no tax, no exit load, and a unit split counts as no return.</p>
    </section>
  );
}
