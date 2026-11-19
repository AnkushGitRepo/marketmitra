'use client';

// This software uses TradingView Lightweight Charts™ (Apache License 2.0). Copyright (c) TradingView, Inc. https://www.tradingview.com/
// The chart footer carries the visible credit and the link the licence asks for.

import { useEffect, useRef } from 'react';
import { hasVisibleInk, shouldUseFallback } from '@/lib/chart/fallback';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Series } from '@/lib/chart/indicators';
import { rangeStartTime, type Bar, type RangeKey } from '@/lib/chart/bars';
import {
  INTRADAY_VISIBLE_BARS,
  intradayRangeStart,
  isIntraday,
  isIntradayTime,
  isTailUpdate,
  type IntradayRange,
  type Timeframe,
} from '@/lib/chart/timeframes';
import { INDICATORS, type IndicatorId } from './constants';
import type { StoredParams } from '@/lib/chart/indicatorParams';
import { computeIndicator } from './indicatorRegistry';
import styles from './ProChart.module.css';

export type ChartKind = 'candles' | 'line';

export interface ChartHandle {
  chart: IChartApi;
  price: ISeriesApi<SeriesType>;
}

interface ChartCanvasProps {
  bars: Bar[];
  kind: ChartKind;
  timeframe: Timeframe;
  /** Leave empty space after the latest candle for Auto-Chart's badges and setup box. */
  roomOnRight?: boolean;
  indicators: IndicatorId[];
  /** The user's indicator settings; anything missing draws with the default. */
  params: StoredParams;
  range: RangeKey;
  /** Bottom-bar choice on an intraday chart; null shows the default window. */
  intradayRange?: IntradayRange | null;
  onReady: (handle: ChartHandle | null) => void;
  onHover: (bar: Bar | null) => void;
  /** Called when the chart can't start, throws, or measures as collapsed, so the page can show its fallback. */
  onFailure?: (reason: string) => void;
}

/** Can this browser draw to a 2D canvas at all? (Some locked-down or memory-starved mobile browsers cannot.) */
function canvasUsable(): boolean {
  try {
    return document.createElement('canvas').getContext('2d') !== null;
  } catch {
    return false;
  }
}

/** Did the chart actually put anything on screen? A chart can "start" and still draw nothing. */
function paintedAnything(el: HTMLElement): boolean {
  const canvases = Array.from(el.querySelectorAll('canvas'));
  if (canvases.length === 0) return false;
  for (const canvas of canvases) {
    if (!canvas.width || !canvas.height) continue;
    try {
      const ctx = canvas.getContext('2d');
      if (ctx && hasVisibleInk(ctx.getImageData(0, 0, canvas.width, canvas.height).data))
        return true;
    } catch {
      return true; // can't inspect the pixels: assume it is fine rather than discard a working chart
    }
  }
  return false;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function themeColors() {
  return {
    up: cssVar('--color-mint-strong', '#34c17c'),
    down: cssVar('--color-danger-soft', '#f0836b'),
    line: cssVar('--app-teal', '#0c8a6c'),
    text: cssVar('--app-text-subtle', '#8a8f98'),
    grid: cssVar('--border-hairline', 'rgba(21,23,28,.07)'),
    crosshair: cssVar('--app-text-subtle', '#8a8f98'),
  };
}

/** A bar time as lightweight-charts wants it: epoch seconds for intraday bars, the `YYYY-MM-DD` string for daily ones. */
const chartTime = (time: string): Time =>
  isIntradayTime(time) ? (Number(time) as UTCTimestamp) : (time as Time);

const DEFAULT_RIGHT_OFFSET_BARS = 4;
/** Empty space after the latest candle while Auto-Chart is on: enough for its badges. */
const ROOM_ON_RIGHT_PX = 240;
const FALLBACK_BAR_SPACING_PX = 8;
const MAX_ROOM_BARS = 120;

const toPoints = (bars: Bar[], values: Series) =>
  bars.flatMap((b, i) =>
    values[i] === null ? [] : [{ time: chartTime(b.time), value: values[i] as number }],
  );

/** Like `toPoints`, with a colour per point (a line that changes colour as it runs). */
const toColoredPoints = (bars: Bar[], values: Series, colors: string[]) =>
  bars.flatMap((b, i) =>
    values[i] === null
      ? []
      : [{ time: chartTime(b.time), value: values[i] as number, color: colors[i] }],
  );

export function ChartCanvas({
  bars,
  kind,
  timeframe,
  roomOnRight = false,
  indicators,
  params,
  range,
  intradayRange = null,
  onReady,
  onHover,
  onFailure,
}: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
  const priceRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const barsByTime = useRef<Map<string, Bar>>(new Map());
  /** What each series needs to refresh its newest points, so a live tick can update in place instead of rebuilding the chart. */
  const updatersRef = useRef<Array<(bars: Bar[], from: number) => void>>([]);
  const builtRef = useRef<{ sig: string; bars: Bar[] } | null>(null);
  const onReadyRef = useRef(onReady);
  const onHoverRef = useRef(onHover);
  const onFailureRef = useRef(onFailure);
  useEffect(() => {
    onReadyRef.current = onReady;
    onHoverRef.current = onHover;
    onFailureRef.current = onFailure;
  });

  // Create the chart once; theme changes re-skin it in place.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!canvasUsable()) {
      onFailureRef.current?.('This browser can\u2019t draw the interactive chart.');
      return;
    }
    const c = themeColors();
    // Fail-safe: a browser that can't create the chart must fall back, never throw into React or leave a blank box.
    let chart: IChartApi;
    try {
      chart = createChart(el, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: c.text,
          fontFamily: 'var(--font-mono), ui-monospace, monospace',
          fontSize: 11,
          panes: { separatorColor: c.grid, enableResize: true },
          // The logo is off because the credit is given in words and a link in the chart footer (see ProChart), as the library licence allows.
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: c.grid, style: LineStyle.Dotted },
          horzLines: { color: c.grid, style: LineStyle.Dotted },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
        timeScale: {
          borderVisible: false,
          rightOffset: DEFAULT_RIGHT_OFFSET_BARS,
          timeVisible: false,
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: c.crosshair,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#15171c',
          },
          horzLine: {
            color: c.crosshair,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#15171c',
          },
        },
      });
    } catch {
      onFailureRef.current?.('The interactive chart couldn\u2019t start on this device.');
      return;
    }
    chartRef.current = chart;

    // Fail-safe: if the container still measures as collapsed once layout has settled, say so instead of showing nothing.
    const collapsedCheck = window.setTimeout(() => {
      if (shouldUseFallback({ errored: false, measuredHeight: el.clientHeight })) {
        onFailureRef.current?.('The chart area couldn\u2019t be displayed on this screen.');
      }
    }, 600);
    // Later, once painting has had time to happen (slow phones included), verify something is actually visible.
    const paintCheck = window.setTimeout(() => {
      if (!paintedAnything(el))
        onFailureRef.current?.('The chart didn\u2019t draw on this device.');
    }, 2200);
    const watchdogs = [collapsedCheck, paintCheck];

    chart.subscribeCrosshairMove((p) => {
      onHoverRef.current(
        p.time === undefined ? null : (barsByTime.current.get(String(p.time)) ?? null),
      );
    });

    const observer = new MutationObserver(() => {
      const t = themeColors();
      chart.applyOptions({
        layout: { textColor: t.text, panes: { separatorColor: t.grid, enableResize: true } },
        grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      });
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });

    return () => {
      watchdogs.forEach((id) => window.clearTimeout(id));
      observer.disconnect();
      onReadyRef.current(null);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = [];
      priceRef.current = null;
      // The series died with the chart; a later build must not take the in-place update path against them.
      updatersRef.current = [];
      builtRef.current = null;
    };
  }, []);

  // (Re)build every series when the data, chart type or indicator set changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const sig = `${kind}|${timeframe}|${indicators.join(',')}|${JSON.stringify(params)}`;
    const built = builtRef.current;
    if (built && built.sig === sig && isTailUpdate(built.bars, bars)) {
      try {
        const from = built.bars.length - 1;
        for (const update of updatersRef.current) update(bars, from);
        barsByTime.current = new Map(bars.map((b) => [b.time, b]));
        builtRef.current = { sig, bars };
        return;
      } catch {
        // fall through to a full rebuild
      }
    }
    try {
      const c = themeColors();
      const timeScale = chart.timeScale();
      const keepRange = timeScale.getVisibleLogicalRange();
      timeScale.applyOptions({ timeVisible: isIntraday(timeframe), secondsVisible: false });
      const updaters: Array<(bars: Bar[], from: number) => void> = [];

      for (const s of seriesRef.current) chart.removeSeries(s);
      seriesRef.current = [];
      barsByTime.current = new Map(bars.map((b) => [b.time, b]));
      const add = <T extends SeriesType>(s: ISeriesApi<T>) => {
        seriesRef.current.push(s as unknown as ISeriesApi<SeriesType>);
        return s;
      };
      const lineOpts = {
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      } as const;

      const price =
        kind === 'candles'
          ? add(
              chart.addSeries(CandlestickSeries, {
                upColor: c.up,
                downColor: c.down,
                borderVisible: false,
                wickUpColor: c.up,
                wickDownColor: c.down,
              }),
            )
          : add(
              chart.addSeries(LineSeries, {
                color: c.line,
                lineWidth: 2,
                crosshairMarkerRadius: 4,
              }),
            );
      price.setData(
        kind === 'candles'
          ? bars.map((b) => ({
              time: chartTime(b.time),
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
            }))
          : bars.map((b) => ({ time: chartTime(b.time), value: b.close })),
      );
      priceRef.current = price as unknown as ISeriesApi<SeriesType>;
      updaters.push((bs, from) => {
        for (const b of bs.slice(from)) {
          price.update(
            (kind === 'candles'
              ? { time: chartTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close }
              : { time: chartTime(b.time), value: b.close }) as never,
          );
        }
      });

      const on = new Set(indicators);

      if (on.has('volume')) {
        const vol = add(
          chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
            priceLineVisible: false,
            lastValueVisible: false,
          }),
        );
        vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        vol.setData(
          bars.map((b) => ({
            time: chartTime(b.time),
            value: b.volume,
            color: `${b.close >= b.open ? c.up : c.down}66`,
          })),
        );
        updaters.push((bs, from) => {
          for (const b of bs.slice(from)) {
            vol.update({
              time: chartTime(b.time),
              value: b.volume,
              color: `${b.close >= b.open ? c.up : c.down}66`,
            });
          }
        });
      }

      // Menu order decides draw order and pane order, so panes stay in a stable sequence however they were switched on.
      let pane = 1;
      for (const def of INDICATORS) {
        if (def.id === 'volume' || !on.has(def.id)) continue;
        const out = computeIndicator(def.id, bars, params[def.id]);
        const paneIndex = def.group === 'Panes' ? pane : 0;
        let histSeries = null as ISeriesApi<'Histogram'> | null;
        if (out.histogram) {
          const hv = out.histogram.values;
          histSeries = add(
            chart.addSeries(
              HistogramSeries,
              { priceLineVisible: false, lastValueVisible: false },
              paneIndex,
            ),
          );
          histSeries.setData(
            bars.flatMap((b, i) =>
              hv[i] === null
                ? []
                : [
                    {
                      time: chartTime(b.time),
                      value: hv[i] as number,
                      color: `${(hv[i] as number) >= 0 ? c.up : c.down}99`,
                    },
                  ],
            ),
          );
        }
        let first: ISeriesApi<'Line'> | null = null;
        const lineSeries: ISeriesApi<'Line'>[] = [];
        for (const l of out.lines) {
          // Pane indicators show their latest value on the axis, for the first line only.
          const showLast: boolean = paneIndex > 0 && first === null;
          const series: ISeriesApi<'Line'> = add(
            chart.addSeries(
              LineSeries,
              {
                ...lineOpts,
                lineWidth: 1,
                color: l.color,
                lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid,
                lastValueVisible: showLast,
              },
              paneIndex,
            ),
          );
          series.setData(
            l.pointColors
              ? toColoredPoints(bars, l.values, l.pointColors)
              : toPoints(bars, l.values),
          );
          first ??= series;
          lineSeries.push(series);
        }
        for (const level of out.levels ?? []) {
          first?.createPriceLine({
            price: level,
            color: c.text,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
            title: '',
          });
        }
        const id = def.id;
        updaters.push((bs, from) => {
          const next = computeIndicator(id as Exclude<IndicatorId, 'volume'>, bs, params[id]);
          next.lines.forEach((l, li) => {
            for (let i = from; i < bs.length; i++) {
              const v = l.values[i];
              if (v === null) continue;
              lineSeries[li].update(
                (l.pointColors
                  ? { time: chartTime(bs[i].time), value: v, color: l.pointColors[i] }
                  : { time: chartTime(bs[i].time), value: v }) as never,
              );
            }
          });
          const hv = next.histogram?.values;
          if (hv && histSeries) {
            for (let i = from; i < bs.length; i++) {
              if (hv[i] === null) continue;
              histSeries.update({
                time: chartTime(bs[i].time),
                value: hv[i] as number,
                color: `${(hv[i] as number) >= 0 ? c.up : c.down}99`,
              });
            }
          }
        });
        if (paneIndex > 0) pane += 1;
      }

      const panes = chart.panes();
      panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));

      if (keepRange) timeScale.setVisibleLogicalRange(keepRange);
      updatersRef.current = updaters;
      builtRef.current = { sig, bars };
      onReadyRef.current({ chart, price: priceRef.current });
    } catch {
      onFailureRef.current?.('The chart hit a problem drawing this data.');
    }
  }, [bars, kind, timeframe, indicators, params]);

  // Make (or give back) the empty space after the latest candle. The space is sized in pixels, not bars, so the badges fit whatever the zoom.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const timeScale = chart.timeScale();
    if (!roomOnRight) {
      timeScale.applyOptions({ rightOffset: DEFAULT_RIGHT_OFFSET_BARS });
      return;
    }
    const range = timeScale.getVisibleLogicalRange();
    const span = range ? range.to - range.from : 0;
    const spacing = span > 0 ? timeScale.width() / span : FALLBACK_BAR_SPACING_PX;
    timeScale.applyOptions({
      rightOffset: Math.min(MAX_ROOM_BARS, Math.ceil(ROOM_ON_RIGHT_PX / spacing)),
    });
  }, [roomOnRight, timeframe, bars.length]);

  // Apply the range tab (daily) or a sensible window of recent bars (intraday), once per timeframe/range/dataset: a live tick
  // must not snap the view back while the user is looking around.
  const appliedRange = useRef('');
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) return;
    const key = `${timeframe}|${range}|${intradayRange ?? ''}|${bars[0].time}`;
    if (appliedRange.current === key) return;
    appliedRange.current = key;
    const last = bars[bars.length - 1].time;
    try {
      if (isIntraday(timeframe)) {
        const from = intradayRange
          ? intradayRangeStart(bars, intradayRange)
          : Math.max(0, bars.length - INTRADAY_VISIBLE_BARS[timeframe]);
        chart.timeScale().setVisibleLogicalRange({
          from,
          to: bars.length + 4,
        });
        return;
      }
      const from = rangeStartTime(range, last);
      if (from === null) chart.timeScale().fitContent();
      else chart.timeScale().setVisibleRange({ from: from as Time, to: last as Time });
    } catch {
      chart.timeScale().fitContent();
    }
  }, [range, intradayRange, timeframe, bars]);

  return <div ref={containerRef} className={styles.canvas} />;
}
