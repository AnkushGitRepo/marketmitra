'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Bar } from '@/lib/chart/bars';
import { INDICATORS, type IndicatorId } from './constants';
import { computeIndicator, type IndicatorOutput } from './indicatorRegistry';
import type { ChartHandle } from './ChartCanvas';
import styles from './ProChart.module.css';

interface IndicatorLegendProps {
  bars: Bar[];
  active: IndicatorId[];
  /** The bar under the crosshair; the latest bar when null. */
  hover: Bar | null;
}

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const compact = (n: number) =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 2 }).format(n);

/** Active indicators in menu order, each with what it draws. Volume has no registry entry: its value is the bar's own. */
function useActiveOutputs(bars: Bar[], active: IndicatorId[]) {
  return useMemo(
    () =>
      INDICATORS.filter((d) => active.includes(d.id)).map((def) => ({
        def,
        out: def.id === 'volume' ? null : (computeIndicator(def.id, bars) as IndicatorOutput),
      })),
    [bars, active],
  );
}

interface Row {
  def: (typeof INDICATORS)[number];
  out: IndicatorOutput | null;
}

function barIndex(bars: Bar[], hover: Bar | null): number {
  const i = hover ? bars.findIndex((b) => b.time === hover.time) : -1;
  return i >= 0 ? i : bars.length - 1;
}

/** Swatch, name with its periods, and the values at the bar (each in its line's colour). */
function Values({ row, bars, at }: { row: Row; bars: Bar[]; at: number }) {
  const { out } = row;
  if (out === null)
    return <span className={styles.indValue}>{bars[at] ? compact(bars[at].volume) : ''}</span>;
  const hist = out.histogram?.values[at];
  return (
    <>
      {out.lines.map((l) => {
        const v = l.values[at];
        return v === null || v === undefined ? null : (
          <span key={`${l.name}-${l.color}`} className={styles.indValue} style={{ color: l.color }}>
            {fmt(v)}
          </span>
        );
      })}
      {hist !== null && hist !== undefined && <span className={styles.indValue}>{fmt(hist)}</span>}
    </>
  );
}

/** Which colour is which on the price chart: name with periods and the value at the hovered bar. Top-left, under the OHLC line. */
export function IndicatorLegend({ bars, active, hover }: IndicatorLegendProps) {
  const rows = useActiveOutputs(bars, active).filter((r) => r.def.group === 'Overlays');
  if (rows.length === 0) return null;
  const at = barIndex(bars, hover);
  return (
    <ul className={styles.indLegend} aria-label="Indicators on the chart">
      {rows.map((row) => (
        <li key={row.def.id} className={styles.indRow}>
          <i className={styles.swatch} style={{ background: row.def.color }} aria-hidden="true" />
          <span className={styles.indName}>{row.def.title}</span>
          <Values row={row} bars={bars} at={at} />
        </li>
      ))}
    </ul>
  );
}

interface PaneLabelsProps {
  handle: ChartHandle | null;
  bars: Bar[];
  active: IndicatorId[];
  hover: Bar | null;
}

/** Names each indicator pane (RSI, MACD, ...) at its top-left corner. Pane heights change when the user drags a separator, so they are polled. */
export function PaneLabels({ handle, bars, active, hover }: PaneLabelsProps) {
  const rows = useActiveOutputs(bars, active).filter((r) => r.def.group === 'Panes');
  const titles = rows.map((r) => r.def);
  const at = barIndex(bars, hover);
  const [tops, setTops] = useState<number[]>([]);

  useEffect(() => {
    if (!handle || titles.length === 0) return;
    let frame = 0;
    let last = '';
    const loop = () => {
      const heights = handle.chart.panes().map((p) => p.getHeight());
      const next = heights.reduce<number[]>(
        (acc, h, i) => [...acc, i === 0 ? 0 : acc[i - 1] + heights[i - 1] + 1],
        [],
      );
      const sig = next.join(',');
      if (sig !== last) {
        last = sig;
        setTops(next);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [handle, titles.length]);

  if (!handle || titles.length === 0) return null;
  return (
    <>
      {rows.map((row, i) => {
        const top = tops[i + 1];
        if (top === undefined) return null;
        return (
          <span
            key={row.def.id}
            className={`${styles.paneLabel} ${styles.indRow}`}
            style={{ top: top + 4 }}
          >
            <i className={styles.swatch} style={{ background: row.def.color }} aria-hidden="true" />
            <span className={styles.indName}>{row.def.title}</span>
            <Values row={row} bars={bars} at={at} />
          </span>
        );
      })}
    </>
  );
}
