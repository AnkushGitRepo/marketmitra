'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChartOverlay } from '@/lib/chart/aiOverlay';
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
}

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
/** Gap between the last candle and the start of the setup box. */
const BOX_GAP_PX = 6;
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

  const setup = overlay.setup;
  const lastBar = bars[bars.length - 1];
  const lastX = lastBar ? xOf({ time: lastBar.time, price: 0 }) : null;
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

  // A support or resistance sitting on the target or stop is the same line: it is named in that badge instead of being drawn twice.
  const levelOn = (price: number | undefined) =>
    price === undefined
      ? undefined
      : overlay.levels.find((l) => (Math.abs(l.price - price) / price) * 100 <= MERGE_PCT);
  const onTarget = levelOn(setup?.target);
  const onStop = levelOn(setup?.stop);
  const drawnLevels = overlay.levels.filter((l) => l !== onTarget && l !== onStop);
  const entryNote = setup?.entryType === 'now' ? '' : ' limit';

  // Every badge goes in the free space at the right edge, beside its line, never over the candles; those that would overlap
  // (a target next to a resistance, an entry next to a stop) are spread apart.
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
  if (hasSetup) {
    wants.push(
      {
        key: 'target',
        y: setupY.target as number,
        text: `TARGET${onTarget ? ` / ${onTarget.label}` : ''} ₹${fmt(setup.target)} (${signed(setup.targetPct)})`,
        className: styles.aiTagSupport,
      },
      {
        key: 'entry',
        y: setupY.entry as number,
        text: `ENTRY ₹${fmt(setup.entry)}${entryNote}`,
        className: styles.aiTagEntry,
      },
      {
        key: 'stop',
        y: setupY.stop as number,
        text: `STOP${onStop ? ` / ${onStop.label}` : ''} ₹${fmt(setup.stop)} (${signed(setup.stopPct)})`,
        className: styles.aiTagResistance,
      },
    );
  }
  const spread = spreadTags(
    wants.map((t) => t.y),
    TAG_HEIGHT + 2,
    TAG_HEIGHT / 2,
    Math.max(TAG_HEIGHT / 2, height - TAG_HEIGHT / 2),
  );

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
        {hasSetup && (
          <g>
            {(() => {
              // The box starts right after the last candle, so the price action stays visible.
              const x0 = Math.min(width, (lastX as number) + BOX_GAP_PX);
              const w = Math.max(0, width - x0);
              const entry = setupY.entry as number;
              const stop = setupY.stop as number;
              const target = setupY.target as number;
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
                </>
              );
            })()}
          </g>
        )}
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
