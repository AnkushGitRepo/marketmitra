'use client';

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
} from 'lightweight-charts';
import type { Series } from '@/lib/chart/indicators';
import { rangeStartTime, type Bar, type RangeKey } from '@/lib/chart/bars';
import { INDICATORS, type IndicatorId } from './constants';
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
  indicators: IndicatorId[];
  range: RangeKey;
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

const toPoints = (bars: Bar[], values: Series) =>
  bars.flatMap((b, i) =>
    values[i] === null ? [] : [{ time: b.time as Time, value: values[i] as number }],
  );

/** Like `toPoints`, with a colour per point (a line that changes colour as it runs). */
const toColoredPoints = (bars: Bar[], values: Series, colors: string[]) =>
  bars.flatMap((b, i) =>
    values[i] === null
      ? []
      : [{ time: b.time as Time, value: values[i] as number, color: colors[i] }],
  );

export function ChartCanvas({
  bars,
  kind,
  indicators,
  range,
  onReady,
  onHover,
  onFailure,
}: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
  const priceRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const barsByTime = useRef<Map<string, Bar>>(new Map());
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
        },
        grid: {
          vertLines: { color: c.grid, style: LineStyle.Dotted },
          horzLines: { color: c.grid, style: LineStyle.Dotted },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
        timeScale: { borderVisible: false, rightOffset: 4, timeVisible: false },
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
        typeof p.time === 'string' ? (barsByTime.current.get(p.time) ?? null) : null,
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
    };
  }, []);

  // (Re)build every series when the data, chart type or indicator set changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      const c = themeColors();
      const timeScale = chart.timeScale();
      const keepRange = timeScale.getVisibleLogicalRange();

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
              time: b.time as Time,
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
            }))
          : bars.map((b) => ({ time: b.time as Time, value: b.close })),
      );
      priceRef.current = price as unknown as ISeriesApi<SeriesType>;

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
            time: b.time as Time,
            value: b.volume,
            color: `${b.close >= b.open ? c.up : c.down}66`,
          })),
        );
      }

      // Menu order decides draw order and pane order, so panes stay in a stable sequence however they were switched on.
      let pane = 1;
      for (const def of INDICATORS) {
        if (def.id === 'volume' || !on.has(def.id)) continue;
        const out = computeIndicator(def.id, bars);
        const paneIndex = def.group === 'Panes' ? pane : 0;
        if (out.histogram) {
          const hv = out.histogram.values;
          add(
            chart.addSeries(
              HistogramSeries,
              { priceLineVisible: false, lastValueVisible: false },
              paneIndex,
            ),
          ).setData(
            bars.flatMap((b, i) =>
              hv[i] === null
                ? []
                : [
                    {
                      time: b.time as Time,
                      value: hv[i] as number,
                      color: `${(hv[i] as number) >= 0 ? c.up : c.down}99`,
                    },
                  ],
            ),
          );
        }
        let first: ISeriesApi<'Line'> | null = null;
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
        if (paneIndex > 0) pane += 1;
      }

      const panes = chart.panes();
      panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));

      if (keepRange) timeScale.setVisibleLogicalRange(keepRange);
      onReadyRef.current({ chart, price: priceRef.current });
    } catch {
      onFailureRef.current?.('The chart hit a problem drawing this data.');
    }
  }, [bars, kind, indicators]);

  // Apply the range tab to the visible window.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) return;
    const last = bars[bars.length - 1].time;
    const from = rangeStartTime(range, last);
    try {
      if (from === null) chart.timeScale().fitContent();
      else chart.timeScale().setVisibleRange({ from: from as Time, to: last as Time });
    } catch {
      chart.timeScale().fitContent();
    }
  }, [range, bars]);

  return <div ref={containerRef} className={styles.canvas} />;
}
