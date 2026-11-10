'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RANGE_KEYS, type Bar, type RangeKey } from '@/lib/chart/bars';
import type { Drawing, DrawingTool } from '@/lib/chart/drawings';
import { ChartCanvas, type ChartHandle, type ChartKind } from './ChartCanvas';
import { ChartFallback } from './ChartFallback';
import { DrawingToolbar } from './DrawingToolbar';
import { DrawingsOverlay } from './DrawingsOverlay';
import { IndicatorMenu } from './IndicatorMenu';
import {
  DEFAULT_INDICATORS,
  INDICATOR_STORAGE_KEY,
  drawingsStorageKey,
  type IndicatorId,
} from './constants';
import styles from './ProChart.module.css';

interface ProChartProps {
  symbol: string;
  bars: Bar[];
  alertHref: string;
  onRangeChange?: (range: RangeKey) => void;
}

const RANGE_LABELS: Record<RangeKey, string> = { '1M': '1M', '3M': '3M', '6M': '6M', YTD: 'YTD', '1Y': '1Y', '5Y': '5Y', ALL: 'All' };
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** localStorage can throw (private mode, blocked site data) — the chart must
 * render the same without it, so every access is guarded. */
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* non-persistent is fine */
  }
}

export function ProChart({ symbol, bars, alertHref, onRangeChange }: ProChartProps) {
  const [range, setRange] = useState<RangeKey>('1Y');
  const [kind, setKind] = useState<ChartKind>('candles');
  // Client-only component (loaded with ssr: false), so reading localStorage in
  // the initializers can't cause a hydration mismatch.
  const [indicators, setIndicators] = useState<IndicatorId[]>(() =>
    readJson<IndicatorId[]>(INDICATOR_STORAGE_KEY, DEFAULT_INDICATORS)
  );
  const [tool, setTool] = useState<DrawingTool>('cursor');
  const [drawings, setDrawings] = useState<Drawing[]>(() => readJson<Drawing[]>(drawingsStorageKey(symbol), []));
  const [handle, setHandle] = useState<ChartHandle | null>(null);
  const [hover, setHover] = useState<Bar | null>(null);
  // Fail-safe: set when the interactive chart can't start / errors / collapses; the stage then shows a simple SVG chart.
  const [failure, setFailure] = useState<string | null>(null);
  const [chartKey, setChartKey] = useState(0);
  const retryInteractive = useCallback(() => {
    setFailure(null);
    setChartKey((k) => k + 1);
  }, []);

  useEffect(() => {
    writeJson(INDICATOR_STORAGE_KEY, indicators);
  }, [indicators]);
  useEffect(() => {
    writeJson(drawingsStorageKey(symbol), drawings);
  }, [drawings, symbol]);

  const toggleIndicator = useCallback((id: IndicatorId) => {
    setIndicators((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }, []);
  const commitDrawing = useCallback((d: Drawing) => setDrawings((cur) => [...cur, d]), []);
  const toolDone = useCallback(() => setTool('cursor'), []);
  const clearDrawings = useCallback(() => setDrawings([]), []);

  const pickRange = (r: RangeKey) => {
    setRange(r);
    onRangeChange?.(r);
  };

  const shown = hover ?? bars[bars.length - 1] ?? null;
  const prevClose = useMemo(() => {
    if (!shown) return null;
    const i = bars.findIndex((b) => b.time === shown.time);
    return i > 0 ? bars[i - 1].close : null;
  }, [bars, shown]);
  const change = shown && prevClose !== null ? shown.close - prevClose : null;
  const up = shown ? (change ?? shown.close - shown.open) >= 0 : true;
  const stateClass = up ? styles.up : styles.down;

  return (
    <div className={styles.workspace}>
      <div className={styles.topbar}>
        <span className={styles.symbolChip}>{symbol}</span>
        <span className={styles.interval} title="Daily bars">D</span>
        <span className={styles.divider} />
        <div className={styles.segment} role="group" aria-label="Chart type">
          {(['candles', 'line'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              className={`${styles.segBtn} ${kind === k ? styles.segBtnActive : ''}`}
              onClick={() => setKind(k)}
            >
              {k === 'candles' ? 'Candles' : 'Line'}
            </button>
          ))}
        </div>
        <span className={styles.divider} />
        <IndicatorMenu active={indicators} onToggle={toggleIndicator} />
        <Link href={alertHref} className={styles.topBtn}>
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path d="M6 16V10a5 5 0 0 1 10 0v6l1.5 2h-13L6 16ZM9.5 19.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Alert
        </Link>
      </div>

      <div className={styles.body}>
        <DrawingToolbar tool={tool} onTool={setTool} hasDrawings={drawings.length > 0} onClear={clearDrawings} />

        <div className={`${styles.stage} ${failure ? styles.stageFailed : ''}`}>
          {shown && !failure && (
            <div className={`${styles.legend} ${stateClass}`} aria-live="off">
              <span className={styles.legendKey}>O</span>
              {fmt(shown.open)}
              <span className={styles.legendKey}>H</span>
              {fmt(shown.high)}
              <span className={styles.legendKey}>L</span>
              {fmt(shown.low)}
              <span className={styles.legendKey}>C</span>
              {fmt(shown.close)}
              {change !== null && prevClose ? (
                <span>
                  {' '}
                  {change >= 0 ? '+' : ''}
                  {fmt(change)} ({change >= 0 ? '+' : ''}
                  {((change / prevClose) * 100).toFixed(2)}%)
                </span>
              ) : null}
            </div>
          )}

          {bars.length > 0 && failure ? (
            <ChartFallback symbol={symbol} bars={bars} reason={failure} onRetry={retryInteractive} />
          ) : bars.length > 0 ? (
            <>
              <ChartCanvas
                key={chartKey}
                bars={bars}
                kind={kind}
                indicators={indicators}
                range={range}
                onReady={setHandle}
                onHover={setHover}
                onFailure={setFailure}
              />
              <DrawingsOverlay
                key={tool}
                handle={handle}
                bars={bars}
                tool={tool}
                drawings={drawings}
                onCommit={commitDrawing}
                onToolDone={toolDone}
              />
            </>
          ) : (
            <p className={styles.empty}>No price history available.</p>
          )}
        </div>
      </div>

      <div className={styles.footer} role="group" aria-label="Date range">
        {RANGE_KEYS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            className={`${styles.rangeBtn} ${range === r ? styles.rangeBtnActive : ''}`}
            onClick={() => pickRange(r)}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
        <span className={styles.footerNote}>Daily bars · prices in ₹</span>
      </div>
    </div>
  );
}
