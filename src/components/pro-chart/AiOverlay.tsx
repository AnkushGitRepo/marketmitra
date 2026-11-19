'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChartOverlay } from '@/lib/chart/aiOverlay';
import type { Bar } from '@/lib/chart/bars';
import type { ChartPoint } from '@/lib/chart/drawings';
import type { ChartHandle } from './ChartCanvas';
import styles from './ProChart.module.css';

interface AiOverlayProps {
  handle: ChartHandle | null;
  bars: Bar[];
  overlay: ChartOverlay;
}

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const SETUP_LEAD_PX = 80;
const TAG_HEIGHT = 18;
const CHAR_PX = 6.4;
/** A level this close (in percent) to the target or stop is the same line. */
const MERGE_PCT = 0.15;
/** A trendline moving less than this over its length reads as a range, not a trend. */
const FLAT_TREND_PCT = 0.3;

/** Read-only SVG layer for Auto-Chart (#228). Anchors are data (bar time + price) so it follows zoom and pan like drawings do. */
export function AiOverlay({ handle, bars, overlay }: AiOverlayProps) {
  const [, setTick] = useState(0);
  const indexByTime = useMemo(() => new Map(bars.map((b, i) => [b.time, i])), [bars]);

  const xOf = useCallback(
    (p: ChartPoint): number | null => {
      const idx = indexByTime.get(p.time);
      if (!handle || idx === undefined) return null;
      return handle.chart.timeScale().logicalToCoordinate(idx as never);
    },
    [handle, indexByTime],
  );
  const yOf = useCallback(
    (price: number): number | null => handle?.price.priceToCoordinate(price) ?? null,
    [handle],
  );

  // The chart has no event for vertical price-scale changes, so repaint when any anchor moves (same approach as DrawingsOverlay).
  useEffect(() => {
    if (!handle) return;
    let frame = 0;
    let last = '';
    const loop = () => {
      const ts = handle.chart.timeScale();
      const probe =
        overlay.levels[0]?.price ?? overlay.setup?.entry ?? bars[bars.length - 1]?.close ?? 0;
      const sig = [
        handle.chart.panes()[0]?.getHeight(),
        ts.width(),
        ts.getVisibleLogicalRange()?.from,
        handle.price.priceToCoordinate(probe),
      ].join('|');
      if (sig !== last) {
        last = sig;
        setTick((t) => t + 1);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [handle, overlay, bars]);

  if (!handle) return null;
  const width = handle.chart.timeScale().width();
  const height = handle.chart.panes()[0]?.getHeight() ?? 0;

  const tag = (
    x: number,
    y: number,
    text: string,
    className: string,
    anchor: 'start' | 'end' = 'end',
  ) => {
    const w = text.length * CHAR_PX + 10;
    const left = anchor === 'end' ? x - w : x;
    return (
      <g>
        <rect
          x={left}
          y={y - TAG_HEIGHT / 2}
          width={w}
          height={TAG_HEIGHT}
          rx={4}
          className={className}
        />
        <text x={left + w / 2} y={y + 4} textAnchor="middle" className={styles.aiTagText}>
          {text}
        </text>
      </g>
    );
  };

  const setup = overlay.setup;
  const lastBar = bars[bars.length - 1];
  const lastX = lastBar ? xOf({ time: lastBar.time, price: 0 }) : null;
  const setupY = setup
    ? { entry: yOf(setup.entry), stop: yOf(setup.stop), target: yOf(setup.target) }
    : null;

  // A support or resistance sitting on the target or stop is the same line: it is named in that badge instead of being drawn twice.
  const levelOn = (price: number | undefined) =>
    price === undefined
      ? undefined
      : overlay.levels.find((l) => (Math.abs(l.price - price) / price) * 100 <= MERGE_PCT);
  const onTarget = levelOn(setup?.target);
  const onStop = levelOn(setup?.stop);
  const drawnLevels = overlay.levels.filter((l) => l !== onTarget && l !== onStop);
  const entryNote =
    setup?.entryType === 'pullback' ? ' · limit' : setup?.entryType === 'retest' ? ' · limit' : '';

  return (
    <div className={styles.overlay} style={{ width, height }} aria-hidden="true">
      <svg width={width} height={height} className={styles.overlaySvg}>
        {drawnLevels.map((level) => {
          const y = yOf(level.price);
          if (y === null) return null;
          const tone = level.kind === 'support' ? styles.aiSupport : styles.aiResistance;
          return (
            <g key={level.label}>
              <line x1={0} x2={width} y1={y} y2={y} className={`${styles.aiLevel} ${tone}`} />
              {tag(
                width - 6,
                y - TAG_HEIGHT,
                `${level.label} · ₹${fmt(level.price)}`,
                tone === styles.aiSupport ? styles.aiTagSupport : styles.aiTagResistance,
              )}
            </g>
          );
        })}
        {overlay.trendlines.map((t, i) => {
          const x1 = xOf(t.a);
          const x2 = xOf(t.b);
          const y1 = yOf(t.a.price);
          const y2 = yOf(t.b.price);
          if (x1 === null || x2 === null || y1 === null || y2 === null) return null;
          const change = ((t.b.price - t.a.price) / t.a.price) * 100;
          const name =
            Math.abs(change) < FLAT_TREND_PCT
              ? '→ Range'
              : change > 0
                ? '↗ Uptrend'
                : '↘ Downtrend';
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} className={styles.aiTrend} />
              {tag(
                (x1 + x2) / 2 + (name.length * CHAR_PX + 10) / 2,
                (y1 + y2) / 2,
                name,
                styles.aiTagTrend,
              )}
            </g>
          );
        })}
        {setup &&
          setupY &&
          setupY.entry !== null &&
          setupY.stop !== null &&
          setupY.target !== null &&
          lastX !== null && (
            <g>
              {(() => {
                const x0 = Math.max(0, lastX - SETUP_LEAD_PX);
                const w = Math.max(0, width - x0);
                const entry = setupY.entry as number;
                const stop = setupY.stop as number;
                const target = setupY.target as number;
                // Each badge sits just inside the zone, on that zone's own outer boundary; ENTRY is on the dividing line.
                const inside = (edge: number, other: number) =>
                  edge + (other > edge ? 1 : -1) * (TAG_HEIGHT / 2 + 2);
                return (
                  <>
                    <rect
                      x={x0}
                      y={Math.min(entry, target)}
                      width={w}
                      height={Math.abs(entry - target)}
                      className={styles.aiZoneTarget}
                    />
                    <rect
                      x={x0}
                      y={Math.min(entry, stop)}
                      width={w}
                      height={Math.abs(entry - stop)}
                      className={styles.aiZoneStop}
                    />
                    <line
                      x1={x0}
                      x2={width}
                      y1={target}
                      y2={target}
                      className={styles.aiEdgeTarget}
                    />
                    <line x1={x0} x2={width} y1={stop} y2={stop} className={styles.aiEdgeStop} />
                    <line x1={x0} x2={width} y1={entry} y2={entry} className={styles.aiEntry} />
                    {tag(
                      x0 + 4,
                      inside(target, entry),
                      `TARGET${onTarget ? ` / ${onTarget.label}` : ''} ₹${fmt(setup.target)} (${signed(setup.targetPct)})`,
                      styles.aiTagSupport,
                      'start',
                    )}
                    {tag(
                      x0 + 4,
                      inside(stop, entry),
                      `STOP${onStop ? ` / ${onStop.label}` : ''} ₹${fmt(setup.stop)} (${signed(setup.stopPct)})`,
                      styles.aiTagResistance,
                      'start',
                    )}
                    {tag(
                      width - 6,
                      entry,
                      `ENTRY ₹${fmt(setup.entry)}${entryNote} · 1 : ${setup.riskReward} R:R`,
                      styles.aiTagEntry,
                    )}
                  </>
                );
              })()}
            </g>
          )}
      </svg>
    </div>
  );
}
