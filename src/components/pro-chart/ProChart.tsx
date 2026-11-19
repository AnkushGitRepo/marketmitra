'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import type { IndicatorParams, StoredParams } from '@/lib/chart/indicatorParams';
import { RANGE_KEYS, type Bar, type RangeKey } from '@/lib/chart/bars';
import type { Drawing, DrawingTool } from '@/lib/chart/drawings';
import { AiOverlay } from './AiOverlay';
import { useAiOverlay } from './useAiOverlay';
import { ChartCanvas, type ChartHandle, type ChartKind } from './ChartCanvas';
import { ChartFallback } from './ChartFallback';
import { DrawingToolbar } from './DrawingToolbar';
import { DrawingsOverlay } from './DrawingsOverlay';
import { IndicatorLegend, PaneLabels } from './IndicatorLegend';
import { DrawingsMenu } from './DrawingsMenu';
import { IndicatorMenu } from './IndicatorMenu';
import {
  DEFAULT_INDICATORS,
  INDICATOR_PARAMS_STORAGE_KEY,
  INDICATOR_STORAGE_KEY,
  drawingsStorageKey,
  type IndicatorId,
} from './constants';
import styles from './ProChart.module.css';

interface ProChartProps {
  symbol: string;
  bars: Bar[];
  /** Where the Alert button goes when `onAlert` is not given. */
  alertHref: string;
  /** When given, Alert opens in place (a modal) instead of navigating away. */
  onAlert?: () => void;
  onRangeChange?: (range: RangeKey) => void;
}

const RANGE_LABELS: Record<RangeKey, string> = {
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  YTD: 'YTD',
  '1Y': '1Y',
  '5Y': '5Y',
  ALL: 'All',
};
// Short form of UNRESTRICTED_DISCLAIMER; the real constant lives in a server module that must stay out of the chart bundle.
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

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d={
          expanded
            ? 'M8 3v5H3M14 3v5h5M8 19v-5H3M14 19v-5h5'
            : 'M3 8V3h5M19 8V3h-5M3 14v5h5M19 14v5h-5'
        }
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d="M6 16V10a5 5 0 0 1 10 0v6l1.5 2h-13L6 16ZM9.5 19.5a1.5 1.5 0 0 0 3 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProChart({ symbol, bars, alertHref, onAlert, onRangeChange }: ProChartProps) {
  const [range, setRange] = useState<RangeKey>('1Y');
  const [kind, setKind] = useState<ChartKind>('candles');
  // Client-only component (loaded with ssr: false), so reading localStorage in
  // the initializers can't cause a hydration mismatch.
  const [indicators, setIndicators] = useState<IndicatorId[]>(() =>
    readJson<IndicatorId[]>(INDICATOR_STORAGE_KEY, DEFAULT_INDICATORS),
  );
  const [params, setParams] = useState<StoredParams>(() =>
    readJson<StoredParams>(INDICATOR_PARAMS_STORAGE_KEY, {}),
  );
  const [tool, setTool] = useState<DrawingTool>('cursor');
  const [drawings, setDrawings] = useState<Drawing[]>(() =>
    readJson<Drawing[]>(drawingsStorageKey(symbol), []),
  );
  const [handle, setHandle] = useState<ChartHandle | null>(null);
  const [hover, setHover] = useState<Bar | null>(null);
  // Fail-safe: set when the interactive chart can't start / errors / collapses; the stage then shows a simple SVG chart.
  const [failure, setFailure] = useState<string | null>(null);
  const [chartKey, setChartKey] = useState(0);
  // Full screen is a CSS overlay, not the browser Fullscreen API: it also works in embedded browsers and keeps all chart state.
  const [expanded, setExpanded] = useState(false);
  const retryInteractive = useCallback(() => {
    setFailure(null);
    setChartKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded]);
  useEffect(() => {
    writeJson(INDICATOR_STORAGE_KEY, indicators);
  }, [indicators]);
  useEffect(() => {
    writeJson(INDICATOR_PARAMS_STORAGE_KEY, params);
  }, [params]);
  useEffect(() => {
    writeJson(drawingsStorageKey(symbol), drawings);
  }, [drawings, symbol]);

  const ai = useAiOverlay(symbol);
  // Indicators Auto-Chart switched on, so turning it off puts back exactly what the user had.
  const [aiIndicators, setAiIndicators] = useState<IndicatorId[]>([]);
  const toggleAi = useCallback(async () => {
    if (ai.status === 'loading') return;
    if (ai.status === 'ready') {
      ai.disable();
      setIndicators((cur) => cur.filter((id) => !aiIndicators.includes(id)));
      setAiIndicators([]);
      return;
    }
    const overlay = await ai.enable();
    if (!overlay) return;
    const added = overlay.indicators.filter((id) => !indicators.includes(id));
    setAiIndicators(added);
    setIndicators((cur) => [...cur, ...added.filter((id) => !cur.includes(id))]);
  }, [ai, aiIndicators, indicators]);

  const toggleIndicator = useCallback((id: IndicatorId) => {
    setIndicators((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }, []);
  const changeParams = useCallback((id: IndicatorId, next: Partial<IndicatorParams> | null) => {
    setParams((cur) => {
      const rest = Object.fromEntries(
        Object.entries(cur).filter(([key]) => key !== id),
      ) as StoredParams;
      return next === null ? rest : { ...rest, [id]: next };
    });
  }, []);
  const commitDrawing = useCallback((d: Drawing) => setDrawings((cur) => [...cur, d]), []);
  const toolDone = useCallback(() => setTool('cursor'), []);
  const removeDrawing = useCallback(
    (id: string) => setDrawings((cur) => cur.filter((d) => d.id !== id)),
    [],
  );
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

  const workspace = (
    <div className={`${styles.workspace} ${expanded ? styles.workspaceExpanded : ''}`}>
      <div className={styles.topbar}>
        <span className={styles.symbolChip}>{symbol}</span>
        <span className={styles.interval} title="Daily bars">
          D
        </span>
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
        <IndicatorMenu
          active={indicators}
          params={params}
          onToggle={toggleIndicator}
          onParams={changeParams}
        />
        <DrawingsMenu drawings={drawings} onRemove={removeDrawing} onClear={clearDrawings} />
        <button
          type="button"
          className={`${styles.topBtn} ${ai.status === 'ready' ? styles.topBtnActive : ''}`}
          aria-pressed={ai.status === 'ready'}
          disabled={ai.status === 'loading'}
          onClick={toggleAi}
        >
          ✨ {ai.status === 'loading' ? 'Drawing…' : 'AI Auto-Chart'}
        </button>
        {onAlert ? (
          <button type="button" className={styles.topBtn} onClick={onAlert}>
            <BellIcon />
            Alert
          </button>
        ) : (
          <Link href={alertHref} className={styles.topBtn}>
            <BellIcon />
            Alert
          </Link>
        )}
        <button
          type="button"
          className={`${styles.topBtn} ${styles.fullscreenBtn}`}
          aria-pressed={expanded}
          aria-label={expanded ? 'Exit full screen' : 'Full screen'}
          title={expanded ? 'Exit full screen (Esc)' : 'Full screen'}
          onClick={() => setExpanded((v) => !v)}
        >
          <ExpandIcon expanded={expanded} />
        </button>
      </div>

      {(ai.status === 'error' || (ai.status === 'ready' && ai.mode === 'unrestricted')) && (
        <div className={styles.aiBar} role="status">
          {ai.status === 'error' ? (
            <span className={styles.aiBarError}>{ai.error}</span>
          ) : (
            ai.overlay &&
            (ai.overlay.setup ? (
              <>
                <span>Unrestricted · local only</span>
                <span className={styles.aiBarStrong}>
                  {ai.overlay.setup.direction === 'long' ? 'Long' : 'Short'} setup: Entry ₹
                  {fmt(ai.overlay.setup.entry)} | Stop ₹{fmt(ai.overlay.setup.stop)} | Target ₹
                  {fmt(ai.overlay.setup.target)} (1 : {ai.overlay.setup.riskReward})
                </span>
                <span>
                  AI opinion from public data, not licensed investment advice. You make the
                  decision.
                </span>
              </>
            ) : (
              <span>
                Unrestricted · local only: no clear entry, stop and target for this chart right now.
                Levels are still shown. Turn Auto-Chart off and on to try again.
              </span>
            ))
          )}
        </div>
      )}

      <div className={styles.body}>
        <DrawingToolbar
          tool={tool}
          onTool={setTool}
          hasDrawings={drawings.length > 0}
          onClear={clearDrawings}
        />

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

          {!failure && bars.length > 0 && (
            <IndicatorLegend bars={bars} active={indicators} params={params} hover={hover} />
          )}
          {!failure && bars.length > 0 && (
            <PaneLabels
              handle={handle}
              bars={bars}
              active={indicators}
              params={params}
              hover={hover}
            />
          )}

          {bars.length > 0 && failure ? (
            <ChartFallback
              symbol={symbol}
              bars={bars}
              reason={failure}
              onRetry={retryInteractive}
            />
          ) : bars.length > 0 ? (
            <>
              <ChartCanvas
                key={chartKey}
                bars={bars}
                kind={kind}
                indicators={indicators}
                params={params}
                range={range}
                onReady={setHandle}
                onHover={setHover}
                onFailure={setFailure}
              />
              {ai.status === 'ready' && ai.overlay && (
                <AiOverlay handle={handle} bars={bars} overlay={ai.overlay} />
              )}
              <DrawingsOverlay
                key={tool}
                handle={handle}
                bars={bars}
                tool={tool}
                drawings={drawings}
                onCommit={commitDrawing}
                onToolDone={toolDone}
                onRemove={removeDrawing}
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

  // The page's enter animation leaves a transform on an ancestor, which would trap `position: fixed` inside the page, so full screen
  // is portalled to <body>. The chart canvas remounts on toggle; indicators, drawings and Auto-Chart state live here and are kept.
  return expanded ? createPortal(workspace, document.body) : workspace;
}
