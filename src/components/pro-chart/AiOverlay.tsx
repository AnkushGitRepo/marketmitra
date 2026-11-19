'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChartOverlay, TradeSetup } from '@/lib/chart/aiOverlay';
import type { BoxBars, CompareSetup } from '@/lib/chart/overlayRuns';
import type { Bar } from '@/lib/chart/bars';
import type { ChartPoint } from '@/lib/chart/drawings';
import { spreadTags } from '@/lib/chart/tagLayout';
import type { ChartHandle } from './ChartCanvas';
import styles from './ProChart.module.css';

interface Tag {
  key: string;
  y: number;
  text: string;
  className: string;
}

interface AiOverlayProps {
  handle: ChartHandle | null;
  bars: Bar[];
  overlay: ChartOverlay;
  /** Bar the setup box starts on (the bar the run was generated on). Defaults to the latest bar. */
  anchorTime?: string | null;
  /** Longest a setup box may run, in candles; null runs it to the right edge. */
  maxBars?: BoxBars;
  /** Other saved runs' setups, drawn as plain boxes beside the full overlay. */
  compare?: CompareSetup[];
}

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
/** Gap between the last candle and the start of the setup box. */
const BOX_GAP_PX = 6;
const TAG_HEIGHT = 18;
/** Width kept clear at the right edge for the level and entry badges when a box runs to the edge. */
const TAG_COLUMN_PX = 150;
const CHAR_PX = 6.4;
/** A trendline moving less than this over its length reads as a range, not a trend. */
const FLAT_TREND_PCT = 0.3;

/** Read-only SVG layer for Auto-Chart (#228). Anchors are data (bar time + price) so it follows zoom and pan like drawings do. */
export function AiOverlay({
  handle,
  bars,
  overlay,
  anchorTime,
  maxBars = null,
  compare = [],
}: AiOverlayProps) {
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

  const setup = overlay.setup;
  const lastBar = bars[bars.length - 1];
  const startBar = anchorTime ?? lastBar?.time;
  const lastX = startBar ? xOf({ time: startBar, price: 0 }) : null;
  const setupY = setup
    ? { entry: yOf(setup.entry), stop: yOf(setup.stop), target: yOf(setup.target) }
    : null;
  const hasSetup =
    setup &&
    setupY &&
    setupY.entry !== null &&
    setupY.stop !== null &&
    setupY.target !== null &&
    lastX !== null;

  const drawnLevels = overlay.levels;

  // Level and entry badges go in the free space at the right edge, beside their line, never over the candles; those that would
  // overlap are spread apart. The target and stop values sit on the trade box itself (see `corner`).
  const wants: Tag[] = [];
  for (const level of drawnLevels) {
    const y = yOf(level.price);
    if (y === null) continue;
    wants.push({
      key: level.label,
      y,
      text: `${level.label} ₹${fmt(level.price)}`,
      className: level.kind === 'support' ? styles.aiTagSupport : styles.aiTagResistance,
    });
  }
  const spread = spreadTags(
    wants.map((t) => t.y),
    TAG_HEIGHT + 2,
    TAG_HEIGHT / 2,
    Math.max(TAG_HEIGHT / 2, height - TAG_HEIGHT / 2),
  );

  // A setup box starts at the candle its run was made on and runs right for at most `maxBars` candles, so later candles sit inside it.
  const box = (t: TradeSetup, anchor: string | undefined, label: string | null) => {
    const full = label === null; // the shown run, not a compared one
    const idx = anchor === undefined ? undefined : indexByTime.get(anchor);
    const ax = anchor === undefined ? null : xOf({ time: anchor, price: 0 });
    const entry = yOf(t.entry);
    const stop = yOf(t.stop);
    const target = yOf(t.target);
    if (idx === undefined || ax === null || entry === null || stop === null || target === null)
      return null;
    const x0 = Math.min(width, Math.max(0, ax + BOX_GAP_PX));
    const endX =
      maxBars === null
        ? width
        : (handle.chart.timeScale().logicalToCoordinate((idx + maxBars) as never) ?? width);
    const x1 = Math.min(width, Math.max(x0, endX));
    const w = x1 - x0;
    if (w <= 0) return null;
    // Target and stop values sit at the box's right end, inside its zone (outside when the zone is too thin), so the right axis stays clear.
    const corner = (y: number, tiers: [string, string, string], cls: string, centered = false) => {
      const inward = entry > y ? 1 : -1;
      // Inside the zone only when the entry badge (centred on its line) leaves room for it.
      const fits = Math.abs(entry - y) >= TAG_HEIGHT * 1.5 + 2;
      const down = fits ? inward > 0 : inward < 0;
      const top = centered ? y - TAG_HEIGHT / 2 : down ? y + 1 : y - 1 - TAG_HEIGHT;
      // Keep clear of the right-edge badges, but only where one sits at the same height.
      const hitsBadge = spread.some(
        (sy) => sy + TAG_HEIGHT / 2 > top && sy - TAG_HEIGHT / 2 < top + TAG_HEIGHT,
      );
      const right = x1 < width - 1 ? x1 - 4 : hitsBadge ? width - TAG_COLUMN_PX : width - 6;
      const room = right - x0 - 4;
      const text = tiers.find((x) => x.length * CHAR_PX + 10 <= room) ?? tiers[2];
      const tw = text.length * CHAR_PX + 10;
      // A box too narrow for even the short label lets it run left, so it is never cut off by the price axis.
      const left = right - tw;
      return (
        <g className={styles.aiTagGroup}>
          <rect x={left} y={top} width={tw} height={TAG_HEIGHT} rx={4} className={cls} />
          <text
            x={left + tw / 2}
            y={top + TAG_HEIGHT / 2 + 4}
            textAnchor="middle"
            className={styles.aiTagText}
          >
            {text}
          </text>
        </g>
      );
    };
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
        <line x1={x0} x2={x1} y1={target} y2={target} className={styles.aiEdgeTarget} />
        <line x1={x0} x2={x1} y1={stop} y2={stop} className={styles.aiEdgeStop} />
        <line x1={x0} x2={x1} y1={entry} y2={entry} className={styles.aiEntry} />
        {full && (
          <>
            {corner(
              entry,
              [
                `ENTRY ₹${fmt(t.entry)}${t.entryType === 'now' ? '' : ' limit'}`,
                `ENTRY ₹${fmt(t.entry)}`,
                `₹${fmt(t.entry)}`,
              ],
              styles.aiTagEntry,
              true,
            )}
            {corner(
              target,
              [
                `TARGET ₹${fmt(t.target)} (${signed(t.targetPct)})`,
                `TARGET ₹${fmt(t.target)}`,
                `₹${fmt(t.target)}`,
              ],
              styles.aiTagSupport,
            )}
            {corner(
              stop,
              [
                `STOP ₹${fmt(t.stop)} (${signed(t.stopPct)})`,
                `STOP ₹${fmt(t.stop)}`,
                `₹${fmt(t.stop)}`,
              ],
              styles.aiTagResistance,
            )}
          </>
        )}
        {label && (
          <text x={x0 + 4} y={Math.min(entry, target, stop) - 4} className={styles.aiBoxLabel}>
            {label}
          </text>
        )}
      </>
    );
  };

  return (
    <div className={styles.overlay} style={{ width, height }} aria-hidden="true">
      <svg width={width} height={height} className={styles.overlaySvg}>
        {drawnLevels.map((level) => {
          const y = yOf(level.price);
          if (y === null) return null;
          const tone = level.kind === 'support' ? styles.aiSupport : styles.aiResistance;
          return (
            <line
              key={level.label}
              x1={0}
              x2={width}
              y1={y}
              y2={y}
              className={`${styles.aiLevel} ${tone}`}
            />
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
          const w = name.length * CHAR_PX + 10;
          // The name sits at the line's last point, on the side away from the candles it belongs to.
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} className={styles.aiTrend} />
              <g opacity={0.9}>
                <rect
                  x={x2 - w}
                  y={y2 - TAG_HEIGHT - 4}
                  width={w}
                  height={TAG_HEIGHT}
                  rx={4}
                  className={styles.aiTagTrend}
                />
                <text x={x2 - w / 2} y={y2 - 8} textAnchor="middle" className={styles.aiTagText}>
                  {name}
                </text>
              </g>
            </g>
          );
        })}
        {compare.map((c) => (
          <g key={c.id}>{box(c.setup, c.anchorTime, c.label)}</g>
        ))}
        {hasSetup && <g>{box(setup, startBar, null)}</g>}
        {wants.map((t, i) => {
          const w = t.text.length * CHAR_PX + 10;
          return (
            <g key={t.key} className={styles.aiTagGroup}>
              <rect
                x={width - 6 - w}
                y={spread[i] - TAG_HEIGHT / 2}
                width={w}
                height={TAG_HEIGHT}
                rx={4}
                className={t.className}
              />
              <text
                x={width - 6 - w / 2}
                y={spread[i] + 4}
                textAnchor="middle"
                className={styles.aiTagText}
              >
                {t.text}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
