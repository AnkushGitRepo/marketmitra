'use client';

import { useEffect, useRef } from 'react';
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
import { bollinger, ema, macd, rsi, sma, type Series } from '@/lib/chart/indicators';
import { rangeStartTime, type Bar, type RangeKey } from '@/lib/chart/bars';
import { INDICATOR_COLORS, type IndicatorId } from './constants';
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
  bars.flatMap((b, i) => (values[i] === null ? [] : [{ time: b.time as Time, value: values[i] as number }]));

export function ChartCanvas({ bars, kind, indicators, range, onReady, onHover }: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
  const priceRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const barsByTime = useRef<Map<string, Bar>>(new Map());
  const onReadyRef = useRef(onReady);
  const onHoverRef = useRef(onHover);
  useEffect(() => {
    onReadyRef.current = onReady;
    onHoverRef.current = onHover;
  });

  // Create the chart once; theme changes re-skin it in place.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const c = themeColors();
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: c.text,
        fontFamily: 'var(--font-mono), ui-monospace, monospace',
        fontSize: 11,
        panes: { separatorColor: c.grid, enableResize: true },
      },
      grid: { vertLines: { color: c.grid, style: LineStyle.Dotted }, horzLines: { color: c.grid, style: LineStyle.Dotted } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderVisible: false, rightOffset: 4, timeVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: c.crosshair, style: LineStyle.Dashed, labelBackgroundColor: '#15171c' },
        horzLine: { color: c.crosshair, style: LineStyle.Dashed, labelBackgroundColor: '#15171c' },
      },
    });
    chartRef.current = chart;

    chart.subscribeCrosshairMove((p) => {
      onHoverRef.current(typeof p.time === 'string' ? (barsByTime.current.get(p.time) ?? null) : null);
    });

    const observer = new MutationObserver(() => {
      const t = themeColors();
      chart.applyOptions({
        layout: { textColor: t.text, panes: { separatorColor: t.grid, enableResize: true } },
        grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });

    return () => {
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

    const closes = bars.map((b) => b.close);
    const lineOpts = { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false } as const;

    const price =
      kind === 'candles'
        ? add(
            chart.addSeries(CandlestickSeries, {
              upColor: c.up,
              downColor: c.down,
              borderVisible: false,
              wickUpColor: c.up,
              wickDownColor: c.down,
            })
          )
        : add(chart.addSeries(LineSeries, { color: c.line, lineWidth: 2, crosshairMarkerRadius: 4 }));
    price.setData(
      kind === 'candles'
        ? bars.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close }))
        : bars.map((b) => ({ time: b.time as Time, value: b.close }))
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
        })
      );
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(
        bars.map((b) => ({ time: b.time as Time, value: b.volume, color: `${b.close >= b.open ? c.up : c.down}66` }))
      );
    }

    const overlay = (id: 'sma20' | 'sma50' | 'sma200' | 'ema20' | 'ema50', values: Series) => {
      if (!on.has(id)) return;
      add(chart.addSeries(LineSeries, { ...lineOpts, lineWidth: 1, color: INDICATOR_COLORS[id] })).setData(toPoints(bars, values));
    };
    overlay('sma20', sma(closes, 20));
    overlay('sma50', sma(closes, 50));
    overlay('sma200', sma(closes, 200));
    overlay('ema20', ema(closes, 20));
    overlay('ema50', ema(closes, 50));

    if (on.has('bb')) {
      const { mid, upper, lower } = bollinger(closes, 20, 2);
      const band = { ...lineOpts, lineWidth: 1, color: INDICATOR_COLORS.bb } as const;
      add(chart.addSeries(LineSeries, band)).setData(toPoints(bars, upper));
      add(chart.addSeries(LineSeries, band)).setData(toPoints(bars, lower));
      add(chart.addSeries(LineSeries, { ...band, lineStyle: LineStyle.Dashed })).setData(toPoints(bars, mid));
    }

    let pane = 1;
    if (on.has('rsi')) {
      const line = add(
        chart.addSeries(LineSeries, { ...lineOpts, lineWidth: 1, color: INDICATOR_COLORS.rsi, lastValueVisible: true }, pane)
      );
      line.setData(toPoints(bars, rsi(closes, 14)));
      for (const level of [30, 70]) {
        line.createPriceLine({ price: level, color: c.text, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
      }
      pane += 1;
    }
    if (on.has('macd')) {
      const { line, signal, histogram } = macd(closes, 12, 26, 9);
      const hist = add(chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane));
      hist.setData(
        bars.flatMap((b, i) =>
          histogram[i] === null
            ? []
            : [{ time: b.time as Time, value: histogram[i] as number, color: `${(histogram[i] as number) >= 0 ? c.up : c.down}99` }]
        )
      );
      add(chart.addSeries(LineSeries, { ...lineOpts, lineWidth: 1, color: INDICATOR_COLORS.macdLine }, pane)).setData(toPoints(bars, line));
      add(chart.addSeries(LineSeries, { ...lineOpts, lineWidth: 1, color: INDICATOR_COLORS.macdSignal }, pane)).setData(toPoints(bars, signal));
    }

    const panes = chart.panes();
    panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));

    if (keepRange) timeScale.setVisibleLogicalRange(keepRange);
    onReadyRef.current({ chart, price: priceRef.current });
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
