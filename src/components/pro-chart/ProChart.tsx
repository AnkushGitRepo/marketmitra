'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import type { IndicatorParams, StoredParams } from '@/lib/chart/indicatorParams';
import { RANGE_KEYS, type Bar, type RangeKey } from '@/lib/chart/bars';
import {
  toggleHidden,
  visibleDrawings,
  type Drawing,
  type DrawingTool,
} from '@/lib/chart/drawings';
import {
  DEFAULT_TIMEFRAME,
  TIMEFRAMES,
  INTRADAY_RANGES,
  intradayRangeAvailable,
  isIntraday,
  isTimeframe,
  type IntradayRange,
  type Timeframe,
} from '@/lib/chart/timeframes';
import {
  isOverlayEmpty,
  overlayItems,
  removeOverlayItem,
  visibleOverlay,
} from '@/lib/chart/overlayItems';
import {
  DEFAULT_BOX_BARS,
  anchorBarTime,
  compareSetups,
  describeRun,
  isBoxBars,
} from '@/lib/chart/overlayRuns';
import type { ChartOverlay } from '@/lib/chart/aiOverlay';
import { AiOverlay } from './AiOverlay';
import { AiRunsMenu } from './AiRunsMenu';
import { SetupMenu } from './SetupMenu';
import {
  addCustomSetup,
  parseCustomSetups,
  type IndicatorSetup,
} from '@/lib/chart/indicatorSetups';
import type { BoxBars } from '@/lib/chart/overlayRuns';
import { useAiOverlay } from './useAiOverlay';
import { useCandles } from './useCandles';
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
  TIMEFRAME_STORAGE_KEY,
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

/** Tooltips for the toolbar and the bottom bar. */
const TIMEFRAME_TITLES: Record<Timeframe, string> = {
  '1m': '1 minute candles',
  '5m': '5 minute candles',
  '15m': '15 minute candles',
  '30m': '30 minute candles',
  '1h': '1 hour candles',
  '1d': 'Daily candles',
  '1w': 'Weekly candles',
  '1mo': 'Monthly candles',
};
const RANGE_TITLES: Record<RangeKey, string> = {
  '1M': 'Show the last month',
  '3M': 'Show the last 3 months',
  '6M': 'Show the last 6 months',
  YTD: 'Show since 1 January',
  '1Y': 'Show the last year',
  '5Y': 'Show the last 5 years',
  ALL: 'Show all available history',
};
const INTRADAY_RANGE_TITLES: Record<IntradayRange, string> = {
  '1D': 'Show the last trading day',
  '5D': 'Show the last 5 trading days',
  '1M': 'Show the last 21 trading days (about a month)',
  ALL: 'Show all loaded candles',
};

const WIDE_DEFAULT_RANGE: Partial<Record<Timeframe, RangeKey>> = { '1w': '5Y', '1mo': 'ALL' };

const RANGE_LABELS: Record<RangeKey, string> = {
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  YTD: 'YTD',
  '1Y': '1Y',
  '5Y': '5Y',
  ALL: 'All',
};
/** Bands that turn a busy chart into spaghetti next to Auto-Chart's own levels; hidden while it is on. */
const NOISY_INDICATORS: IndicatorId[] = ['bb'];
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

export function ProChart({
  symbol,
  bars: dailyBars,
  alertHref,
  onAlert,
  onRangeChange,
}: ProChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>(() => {
    const saved = readJson<unknown>(TIMEFRAME_STORAGE_KEY, DEFAULT_TIMEFRAME);
    return isTimeframe(saved) ? saved : DEFAULT_TIMEFRAME;
  });
  const candles = useCandles(symbol, timeframe, dailyBars);
  const bars = candles.bars;
  const [range, setRange] = useState<RangeKey>('1Y');
  // Week and Month charts have their own range (the Day one would show a handful of bars), starting wide.
  const [tfRanges, setTfRanges] = useState<Partial<Record<Timeframe, RangeKey>>>({});
  const shownRange: RangeKey =
    timeframe === '1d' ? range : (tfRanges[timeframe] ?? WIDE_DEFAULT_RANGE[timeframe] ?? range);
  // The bottom-bar choice on an intraday chart; null until picked (the chart then shows a session or two).
  const [intradayRange, setIntradayRange] = useState<IntradayRange | null>(null);
  const [kind, setKind] = useState<ChartKind>('candles');
  // Client-only component (loaded with ssr: false), so reading localStorage in
  // the initializers can't cause a hydration mismatch.
  const [indicators, setIndicators] = useState<IndicatorId[]>(() =>
    readJson<IndicatorId[]>(INDICATOR_STORAGE_KEY, DEFAULT_INDICATORS),
  );
  const [params, setParams] = useState<StoredParams>(() =>
    readJson<StoredParams>(INDICATOR_PARAMS_STORAGE_KEY, {}),
  );
  // The user's own indicator setups (#259): per-viewer, kept in the browser like the indicator choices themselves.
  const [customSetups, setCustomSetups] = useState<IndicatorSetup[]>(() =>
    parseCustomSetups(readJson<unknown>('mm-chart-setups', [])),
  );
  const [tool, setTool] = useState<DrawingTool>('cursor');
  // Drawings belong to a timeframe: a line drawn on the 5m chart means nothing at a different zoom. The stored list swaps in the
  // same render as the timeframe, so the save effect never writes one timeframe's drawings under another's key.
  const drawKey = drawingsStorageKey(symbol, timeframe);
  const [drawState, setDrawState] = useState(() => ({
    key: drawKey,
    list: readJson<Drawing[]>(drawKey, []),
  }));
  let activeDraw = drawState;
  if (drawState.key !== drawKey) {
    activeDraw = { key: drawKey, list: readJson<Drawing[]>(drawKey, []) };
    setDrawState(activeDraw);
  }
  const drawings = activeDraw.list;
  const setDrawings = useCallback(
    (update: (cur: Drawing[]) => Drawing[]) =>
      setDrawState((st) => ({ ...st, list: update(st.list) })),
    [],
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
    writeJson(drawState.key, drawState.list);
  }, [drawState]);
  useEffect(() => {
    writeJson(TIMEFRAME_STORAGE_KEY, timeframe);
  }, [timeframe]);

  const ai = useAiOverlay(symbol, timeframe);
  // How long a trade box may run, and whether every saved setup is drawn at once: per-viewer conveniences, remembered in the browser.
  const [boxBars, setBoxBars] = useState<BoxBars>(() => {
    const stored = readJson<unknown>('mm-chart-box-bars', DEFAULT_BOX_BARS);
    return isBoxBars(stored) ? stored : DEFAULT_BOX_BARS;
  });
  const [compareAll, setCompareAll] = useState<boolean>(
    () => readJson<unknown>('mm-chart-compare-all', false) === true,
  );
  // Auto-Chart changes the indicator set while it is on (adds what it recommends, hides noisy bands so the candles and its levels
  // stay readable); turning it off puts back exactly what the user had.
  const [aiIndicators, setAiIndicators] = useState<IndicatorId[]>([]);
  const [aiHidden, setAiHidden] = useState<IndicatorId[]>([]);
  // AI items the user hid from the Drawings menu; cleared whenever Auto-Chart goes off.
  const [aiHiddenIds, setAiHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const restoreIndicators = useCallback(() => {
    setAiHiddenIds(new Set());
    setIndicators((cur) => [
      ...cur.filter((id) => !aiIndicators.includes(id)),
      ...aiHidden.filter((id) => !cur.includes(id)),
    ]);
    setAiIndicators([]);
    setAiHidden([]);
  }, [aiIndicators, aiHidden]);
  // Switching on or to another run: bring in the indicators it recommends and hide the noisy ones, remembering what to give back.
  const adoptOverlay = useCallback(
    (overlay: ChartOverlay) => {
      const hidden = indicators.filter((id) => NOISY_INDICATORS.includes(id));
      const added = overlay.indicators.filter(
        (id) => !indicators.includes(id) && !NOISY_INDICATORS.includes(id),
      );
      const union = (a: IndicatorId[], b: IndicatorId[]) => [
        ...a,
        ...b.filter((x) => !a.includes(x)),
      ];
      setAiHidden((cur) => union(cur, hidden));
      setAiIndicators((cur) => union(cur, added));
      setAiHiddenIds(new Set());
      setIndicators((cur) => [
        ...cur.filter((id) => !hidden.includes(id)),
        ...added.filter((id) => !cur.includes(id)),
      ]);
    },
    [indicators],
  );
  // A setup replaces the indicators and their settings; what Auto-Chart had added or hidden is forgotten so turning it off cannot undo this.
  const applySetup = useCallback((setup: IndicatorSetup) => {
    setIndicators(setup.indicators);
    setParams(setup.params);
    setAiIndicators([]);
    setAiHidden([]);
  }, []);
  const saveSetup = useCallback(
    (name: string) => {
      const next = addCustomSetup(customSetups, name, indicators, params, crypto.randomUUID());
      setCustomSetups(next);
      writeJson('mm-chart-setups', next);
    },
    [customSetups, indicators, params],
  );
  const deleteSetup = useCallback(
    (id: string) => {
      const next = customSetups.filter((s) => s.id !== id);
      setCustomSetups(next);
      writeJson('mm-chart-setups', next);
    },
    [customSetups],
  );
  const toggleAi = useCallback(async () => {
    if (ai.status === 'loading') return;
    if (ai.status === 'ready') {
      ai.disable();
      restoreIndicators();
      return;
    }
    const overlay = await ai.enable();
    if (overlay) adoptOverlay(overlay);
  }, [ai, adoptOverlay, restoreIndicators]);
  const showRun = useCallback(
    (id: string) => {
      const overlay = ai.show(id);
      if (overlay) adoptOverlay(overlay);
    },
    [ai, adoptOverlay],
  );
  const generateRun = useCallback(async () => {
    const overlay = await ai.generate();
    if (overlay) adoptOverlay(overlay);
  }, [ai, adoptOverlay]);
  const deleteRun = useCallback(
    async (id: string) => {
      const { next, off } = await ai.remove(id);
      if (off) restoreIndicators();
      else if (next) adoptOverlay(next);
    },
    [ai, adoptOverlay, restoreIndicators],
  );

  // Auto-Chart's drawings are items in the Drawings menu: remove one, or all (which is turning it off). Removing the last turns it off.
  const aiItems = useMemo(
    () => (ai.status === 'ready' && ai.overlay ? overlayItems(ai.overlay) : []),
    [ai.status, ai.overlay],
  );
  const removeAiItem = useCallback(
    (id: string) => {
      if (!ai.overlay) return;
      const next = removeOverlayItem(ai.overlay, id);
      setAiHiddenIds((cur) => new Set([...cur].filter((x) => x !== id)));
      if (isOverlayEmpty(next)) {
        ai.disable();
        restoreIndicators();
      } else {
        ai.update(next);
      }
    },
    [ai, restoreIndicators],
  );
  const toggleAiHidden = useCallback((id: string) => {
    setAiHiddenIds((cur) => new Set(cur.has(id) ? [...cur].filter((x) => x !== id) : [...cur, id]));
  }, []);
  const shownOverlay = useMemo(
    () => (ai.status === 'ready' && ai.overlay ? visibleOverlay(ai.overlay, aiHiddenIds) : null),
    [ai.status, ai.overlay, aiHiddenIds],
  );
  const activeRun = useMemo(
    () => ai.runs.find((r) => r.id === ai.activeId) ?? null,
    [ai.runs, ai.activeId],
  );
  const drawnDrawings = useMemo(() => visibleDrawings(drawings), [drawings]);
  const toggleHideDrawing = useCallback(
    (id: string) => setDrawings((cur) => toggleHidden(cur, id)),
    [setDrawings],
  );
  const clearAi = useCallback(() => {
    ai.disable();
    restoreIndicators();
  }, [ai, restoreIndicators]);

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
  const commitDrawing = useCallback(
    (d: Drawing) => setDrawings((cur) => [...cur, d]),
    [setDrawings],
  );
  const toolDone = useCallback(() => setTool('cursor'), []);
  const removeDrawing = useCallback(
    (id: string) => setDrawings((cur) => cur.filter((d) => d.id !== id)),
    [setDrawings],
  );
  const clearDrawings = useCallback(() => setDrawings(() => []), [setDrawings]);

  // Auto-Chart is drawn for one timeframe's bars, so changing timeframe turns it off (and puts back the indicators it added).
  const pickTimeframe = (next: Timeframe) => {
    if (next === timeframe) return;
    if (ai.status !== 'idle') {
      ai.disable();
      restoreIndicators();
    }
    setTool('cursor');
    setHover(null);
    setTimeframe(next);
  };

  // Only a range the loaded data can fill is applied; on a timeframe with less history it falls back to the default window.
  const shownIntradayRange =
    intradayRange && intradayRangeAvailable(bars, intradayRange) ? intradayRange : null;

  const pickRange = (r: RangeKey) => {
    if (timeframe !== '1d') {
      setTfRanges((cur) => ({ ...cur, [timeframe]: r }));
      return;
    }
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
    <div
      className={`${styles.workspace} ${expanded ? styles.workspaceExpanded : ''}`}
      data-menu-bounds=""
    >
      <div className={styles.topbar}>
        {expanded && <span className={styles.symbolChip}>{symbol}</span>}
        <div className={`${styles.segment} ${styles.tfInline}`} role="group" aria-label="Timeframe">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={timeframe === t.id}
              title={TIMEFRAME_TITLES[t.id]}
              className={`${styles.segBtn} ${timeframe === t.id ? styles.segBtnActive : ''}`}
              onClick={() => pickTimeframe(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          className={`${styles.pickSelect} ${styles.tfSelect}`}
          aria-label="Timeframe"
          title="Candle size"
          value={timeframe}
          onChange={(e) => pickTimeframe(e.target.value as Timeframe)}
        >
          {TIMEFRAMES.map((t) => (
            <option key={t.id} value={t.id} title={TIMEFRAME_TITLES[t.id]}>
              {t.label}
            </option>
          ))}
        </select>
        {candles.live && (
          <span className={styles.liveDot} title="Live: updating while the market is open">
            Live
          </span>
        )}
        <span className={styles.divider} />
        <select
          className={styles.pickSelect}
          aria-label="Chart type"
          title="Chart type: candles or a line"
          value={kind}
          onChange={(e) => setKind(e.target.value as ChartKind)}
        >
          <option value="candles">Candles</option>
          <option value="line">Line</option>
        </select>
        <span className={styles.divider} />
        <IndicatorMenu
          active={indicators}
          params={params}
          onToggle={toggleIndicator}
          onParams={changeParams}
        />
        <SetupMenu
          active={indicators}
          params={params}
          custom={customSetups}
          onApply={applySetup}
          onSave={saveSetup}
          onDelete={deleteSetup}
        />
        <DrawingsMenu
          drawings={drawings}
          onRemove={removeDrawing}
          onClear={clearDrawings}
          onToggleHide={toggleHideDrawing}
          hiddenAi={aiHiddenIds}
          onToggleHideAi={toggleAiHidden}
          aiItems={aiItems}
          onRemoveAi={removeAiItem}
          onClearAi={clearAi}
        />
        <button
          type="button"
          className={`${styles.topBtn} ${ai.status === 'ready' ? styles.aiBtnOn : ''}`}
          aria-pressed={ai.status === 'ready'}
          aria-label="AI Auto-Chart"
          title="AI Auto-Chart: levels, trendlines and a trade setup"
          disabled={ai.status === 'loading'}
          onClick={toggleAi}
        >
          {ai.status === 'ready' && <span className={styles.aiOnDot} aria-hidden="true" />}✨{' '}
          <span className={styles.btnText}>
            {ai.status === 'loading' ? 'Drawing…' : 'AI Auto-Chart'}
          </span>
        </button>
        <AiRunsMenu
          runs={ai.runs}
          activeId={ai.activeId}
          generating={ai.status === 'loading'}
          onShow={showRun}
          onDelete={deleteRun}
          onGenerate={generateRun}
          boxBars={boxBars}
          onBoxBars={(v) => {
            setBoxBars(v);
            writeJson('mm-chart-box-bars', v);
          }}
          compareAll={compareAll}
          onCompareAll={(v) => {
            setCompareAll(v);
            writeJson('mm-chart-compare-all', v);
          }}
        />
        <div className={styles.topbarEnd}>
          {onAlert ? (
            <button
              type="button"
              className={`${styles.topBtn} ${styles.iconBtn}`}
              aria-label="Set price alert"
              title="Set price alert"
              onClick={onAlert}
            >
              <BellIcon />
            </button>
          ) : (
            <Link
              href={alertHref}
              className={`${styles.topBtn} ${styles.iconBtn}`}
              aria-label="Set price alert"
              title="Set price alert"
            >
              <BellIcon />
            </Link>
          )}
          <button
            type="button"
            className={`${styles.topBtn} ${styles.iconBtn}`}
            aria-pressed={expanded}
            aria-label={expanded ? 'Exit full screen' : 'Full screen'}
            title={expanded ? 'Exit full screen (Esc)' : 'Full screen'}
            onClick={() => setExpanded((v) => !v)}
          >
            <ExpandIcon expanded={expanded} />
          </button>
        </div>
      </div>

      {(ai.status === 'error' || ai.status === 'ready' || ai.notice) && (
        <div className={styles.aiBar} role="status">
          {ai.error && <span className={styles.aiBarError}>{ai.error}</span>}
          {ai.notice && <span className={styles.aiBarError}>{ai.notice}</span>}
          {ai.status === 'ready' && ai.overlay && (
            <>
              {activeRun && (
                <span>
                  Auto-Chart from {describeRun(activeRun).when} (price then{' '}
                  {describeRun(activeRun).price})
                </span>
              )}
              {ai.overlay.setup ? (
                <>
                  <span className={styles.aiBarStrong}>
                    {ai.overlay.setup.direction === 'long' ? 'Long' : 'Short'} setup
                    {ai.overlay.setup.entryType === 'pullback'
                      ? ' on a pullback'
                      : ai.overlay.setup.entryType === 'retest'
                        ? ' on a retest'
                        : ' at the current zone'}
                    : Entry ₹{fmt(ai.overlay.setup.entry)} | Stop ₹{fmt(ai.overlay.setup.stop)} |
                    Target ₹{fmt(ai.overlay.setup.target)} (1 : {ai.overlay.setup.riskReward})
                  </span>
                </>
              ) : (
                ai.overlay.setupNote && (
                  <span>Unrestricted mode: {ai.overlay.setupNote} Levels are still shown.</span>
                )
              )}
            </>
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
                timeframe={timeframe}
                roomOnRight={ai.status === 'ready'}
                indicators={indicators}
                params={params}
                range={shownRange}
                intradayRange={shownIntradayRange}
                onReady={setHandle}
                onHover={setHover}
                onFailure={setFailure}
              />
              {shownOverlay && (
                <AiOverlay
                  handle={handle}
                  bars={bars}
                  overlay={shownOverlay}
                  anchorTime={activeRun ? anchorBarTime(bars, activeRun.createdAt) : null}
                  maxBars={boxBars}
                  compare={compareAll ? compareSetups(ai.runs, ai.activeId, bars, new Date()) : []}
                />
              )}
              <DrawingsOverlay
                key={tool}
                handle={handle}
                bars={bars}
                tool={tool}
                drawings={drawnDrawings}
                onCommit={commitDrawing}
                onToolDone={toolDone}
                onRemove={removeDrawing}
              />
            </>
          ) : timeframe !== '1d' && candles.status === 'loading' ? (
            <p className={styles.empty}>Loading {timeframe} candles…</p>
          ) : timeframe !== '1d' && candles.status === 'error' ? (
            <p className={styles.empty}>
              Could not load {timeframe} candles.{' '}
              <button type="button" className={styles.retryBtn} onClick={candles.retry}>
                Try again
              </button>
            </p>
          ) : (
            <p className={styles.empty}>No price history available.</p>
          )}
        </div>
      </div>

      <div className={styles.footer} role="group" aria-label="Date range">
        {isIntraday(timeframe)
          ? INTRADAY_RANGES.map((r) => {
              const available = intradayRangeAvailable(bars, r);
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={shownIntradayRange === r}
                  disabled={!available}
                  title={
                    available
                      ? INTRADAY_RANGE_TITLES[r]
                      : `${INTRADAY_RANGE_TITLES[r]} (not enough history at this timeframe)`
                  }
                  className={`${styles.rangeBtn} ${shownIntradayRange === r ? styles.rangeBtnActive : ''}`}
                  onClick={() => setIntradayRange(r)}
                >
                  {r === 'ALL' ? 'All' : r}
                </button>
              );
            })
          : RANGE_KEYS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={shownRange === r}
                title={RANGE_TITLES[r]}
                className={`${styles.rangeBtn} ${shownRange === r ? styles.rangeBtnActive : ''}`}
                onClick={() => pickRange(r)}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
        <span
          className={styles.footerNote}
          title="Candle size and the zone the times are in; prices are in rupees"
        >
          {isIntraday(timeframe)
            ? `${timeframe} candles · IST · prices in ₹`
            : `${{ '1d': 'Daily', '1w': 'Weekly', '1mo': 'Monthly' }[timeframe as '1d' | '1w' | '1mo']} bars · prices in ₹`}
          {' · '}
          <a
            className={styles.creditLink}
            title="Charts by TradingView Lightweight Charts"
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            TradingView
          </a>
        </span>
      </div>
    </div>
  );

  // The page's enter animation leaves a transform on an ancestor, which would trap `position: fixed` inside the page, so full screen
  // is portalled to <body>. The chart canvas remounts on toggle; indicators, drawings and Auto-Chart state live here and are kept.
  return expanded ? createPortal(workspace, document.body) : workspace;
}
