'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { areaPath, parseNavSeries } from '@/lib/funds/chart';
import { DASH, formatDate, formatPercent, returnTone } from '@/lib/funds/format';
import { parseCustomAmount, SIP_AMOUNTS, SIP_YEARS, simulateSip } from '@/lib/funds/sip';
import { buildSipChart, type SipMark } from '@/lib/funds/sipChart';
import type { NavPoint } from '@/lib/funds/types';
import { ChartArea, ChartReveal } from './ChartMotion';
import styles from './SipSimulator.module.css';
import { useCountUp } from './useCountUp';

const WIDTH = 720;
const HEIGHT = 280;
const PAD = 24;
/** The left margin holds the amount label beside the lines, so it never sits on them. */
const PAD_LEFT = 104;
/** A typed amount is applied this long after the last keystroke. */
const CUSTOM_DEBOUNCE_MS = 250;

const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function SipSimulator({ schemeCode, leading }: { readonly schemeCode: number; /** The chart-mode toggle, shown at the top of the card. */ readonly leading?: ReactNode }) {
  const [series, setSeries] = useState<readonly NavPoint[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [preset, setPreset] = useState<number>(10_000);
  const [customText, setCustomText] = useState('');
  const [custom, setCustom] = useState<number | null>(null);
  const [years, setYears] = useState<number>(3);
  const [hover, setHover] = useState<SipMark | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/funds/${schemeCode}/nav?range=max`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = parseNavSeries(await response.json());
        if (!parsed) throw new Error('unexpected NAV response');
        setSeries(parsed);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [schemeCode]);

  // A typed amount is applied after a short pause; one that is out of range, or not a number, leaves the last valid result in place.
  const typed = useMemo(() => parseCustomAmount(customText), [customText]);
  useEffect(() => {
    if (typed.kind === 'invalid') return;
    const timer = setTimeout(() => setCustom(typed.kind === 'ok' ? typed.value : null), CUSTOM_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const amount = custom ?? preset;
  const result = useMemo(() => (series ? simulateSip(series, amount, years) : null), [series, amount, years]);
  const chart = useMemo(() => (result ? buildSipChart(result.points, WIDTH, HEIGHT, PAD, PAD_LEFT) : null), [result]);

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!chart || !box || box.width === 0) return;
    const x = ((event.clientX - box.left) / box.width) * WIDTH;
    setHover(chart.marks.reduce((best, m) => (Math.abs(m.x - x) < Math.abs(best.x - x) ? m : best), chart.marks[0] as SipMark));
  };

  const shown = hover ?? chart?.marks[chart.marks.length - 1] ?? null;
  const gain = result ? result.value - result.invested : null;
  // The four figures count up to their new values (#304); hooks stay at the top level, before any early return.
  const investedShown = useCountUp(result?.invested ?? null);
  const valueShown = useCountUp(result?.value ?? null);
  const gainShown = useCountUp(gain);
  const xirrShown = useCountUp(result?.xirr ?? null);

  return (
    <section className={styles.card} aria-label="SIP simulator">
      {leading && <div className={styles.lead}>{leading}</div>}
      <div className={styles.controls}>
        <div className={styles.group} role="group" aria-label="Monthly amount">
          {SIP_AMOUNTS.map((a) => {
            const selected = customText.trim() === '' && a === preset;
            return (
              <button
                key={a}
                type="button"
                className={`${styles.pill} ${selected ? styles.active : ''}`}
                aria-pressed={selected}
                onClick={() => {
                  setPreset(a);
                  setCustomText('');
                  setCustom(null);
                }}
              >
                {rupees(a)}
              </button>
            );
          })}
          <label className={`${styles.custom} ${customText.trim() !== '' ? (typed.kind === 'invalid' ? styles.customInvalid : styles.customActive) : ''}`}>
            <span aria-hidden="true">₹</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className={styles.customInput}
              placeholder="Other"
              aria-label="Custom monthly amount in rupees"
              aria-invalid={typed.kind === 'invalid'}
              aria-describedby={typed.kind === 'invalid' ? 'sip-custom-hint' : undefined}
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
            />
          </label>
        </div>
        <div className={styles.group} role="group" aria-label="Period">
          {SIP_YEARS.map((y) => (
            <button key={y} type="button" className={`${styles.pill} ${y === years ? styles.active : ''}`} aria-pressed={y === years} onClick={() => setYears(y)}>
              {y}Y
            </button>
          ))}
        </div>
      </div>

      {typed.kind === 'invalid' && (
        <p id="sip-custom-hint" className={styles.hint} role="status">
          {typed.reason} Showing {rupees(amount)} a month until then.
        </p>
      )}

      {failed && <p className={styles.error} role="alert">Could not load this fund’s NAV history.</p>}
      {!failed && !series && <p className={styles.empty}>Loading…</p>}
      {series && !result && (
        <p className={styles.empty}>This fund has less than {years} {years === 1 ? 'year' : 'years'} of NAV history, so that SIP cannot be simulated.</p>
      )}

      {result && chart && shown && (
        <>
          <dl className={styles.summary}>
            <div><dt>Invested</dt><dd>{rupees(investedShown ?? result.invested)}</dd></div>
            <div><dt>Value today</dt><dd>{rupees(valueShown ?? result.value)}</dd></div>
            <div>
              <dt>Gain</dt>
              <dd className={returnTone(gain) === 'up' ? styles.up : returnTone(gain) === 'down' ? styles.down : ''}>
                {gain === null ? DASH : `${(gainShown ?? gain) < 0 ? '-' : '+'}${rupees(Math.abs(gainShown ?? gain))}`}
              </dd>
            </div>
            {result.xirr !== null && <div><dt>XIRR</dt><dd>{formatPercent(xirrShown ?? result.xirr)}</dd></div>}
          </dl>
          <svg
            ref={svgRef}
            className={styles.svg}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`${rupees(amount)} a month for ${years} years: ${rupees(result.invested)} invested, worth ${rupees(result.value)} today`}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
          >
            <text className={styles.axis} x={PAD_LEFT - 8} y={PAD + 4} textAnchor="end">{rupees(chart.max)}</text>
            <text className={styles.axis} x={PAD_LEFT} y={HEIGHT - 6}>{formatDate(result.points[0]?.date ?? null)}</text>
            <text className={styles.axis} x={WIDTH - PAD} y={HEIGHT - 6} textAnchor="end">{formatDate(result.points[result.points.length - 1]?.date ?? null)}</text>
            <ChartReveal width={WIDTH} height={HEIGHT} replayKey={`${amount}:${years}`}>
              <ChartArea d={areaPath(chart.marks.map((m) => ({ x: m.x, y: m.valueY })), HEIGHT - PAD)} tone="up" />
              <path className={styles.invested} d={chart.investedPath} />
              <path className={styles.value} d={chart.valuePath} />
            </ChartReveal>
            {hover && <line className={styles.guide} x1={hover.x} x2={hover.x} y1={PAD - 10} y2={HEIGHT - PAD} />}
          </svg>
          <p className={styles.readout}>
            {formatDate(shown.date)} · invested {rupees(shown.invested)} · worth {rupees(shown.value)}
          </p>
          <ul className={styles.legend} aria-hidden="true">
            <li><span className={styles.keyValue} /> Value</li>
            <li><span className={styles.keyInvested} /> Invested</li>
          </ul>
        </>
      )}
      <p className={styles.note}>A look back, not a forecast: each instalment is priced at that day’s NAV, with no tax or exit load.</p>
    </section>
  );
}
