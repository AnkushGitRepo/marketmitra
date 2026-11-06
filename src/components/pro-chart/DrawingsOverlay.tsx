'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bar } from '@/lib/chart/bars';
import { fibPrices, measure, type ChartPoint, type Drawing, type DrawingTool } from '@/lib/chart/drawings';
import type { ChartHandle } from './ChartCanvas';
import styles from './ProChart.module.css';

interface DrawingsOverlayProps {
  handle: ChartHandle | null;
  bars: Bar[];
  tool: DrawingTool;
  drawings: Drawing[];
  onCommit: (drawing: Drawing) => void;
  onToolDone: () => void;
}

interface Px {
  x: number;
  y: number;
}

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const signed = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n)}`;
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function DrawingsOverlay({ handle, bars, tool, drawings, onCommit, onToolDone }: DrawingsOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<ChartPoint | null>(null);
  const [cursor, setCursor] = useState<ChartPoint | null>(null);
  const [textAt, setTextAt] = useState<(ChartPoint & Px) | null>(null);
  const [, setTick] = useState(0);

  const indexByTime = useMemo(() => new Map(bars.map((b, i) => [b.time, i])), [bars]);

  // Data → pixels. Null when the anchor can't be placed (no data yet).
  const toPx = useCallback(
    (p: ChartPoint): Px | null => {
      if (!handle) return null;
      const idx = indexByTime.get(p.time);
      if (idx === undefined) return null;
      const x = handle.chart.timeScale().logicalToCoordinate(idx as never);
      const y = handle.price.priceToCoordinate(p.price);
      return x === null || y === null ? null : { x, y };
    },
    [handle, indexByTime]
  );

  // Pixels → data, snapped to the nearest bar.
  const toPoint = useCallback(
    (x: number, y: number): ChartPoint | null => {
      if (!handle || bars.length === 0) return null;
      const logical = handle.chart.timeScale().coordinateToLogical(x);
      const price = handle.price.coordinateToPrice(y);
      if (logical === null || price === null) return null;
      const idx = Math.min(bars.length - 1, Math.max(0, Math.round(logical)));
      return { time: bars[idx].time, price };
    },
    [handle, bars]
  );

  // The chart has no event for vertical price-scale changes, so re-render when
  // an anchor's pixel position moves. Cheap: one signature per frame.
  useEffect(() => {
    if (!handle || drawings.length === 0) return;
    let frame = 0;
    let last = '';
    const loop = () => {
      const h = handle.chart.panes()[0]?.getHeight() ?? 0;
      const w = handle.chart.timeScale().width();
      const sig = [h, w, handle.chart.timeScale().getVisibleLogicalRange()?.from, ...drawings.map((d) => {
        const p = toPx(d.a);
        return p ? `${p.x.toFixed(1)},${p.y.toFixed(1)}` : 'x';
      })].join('|');
      if (sig !== last) {
        last = sig;
        setTick((t) => t + 1);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [handle, drawings, toPx]);

  // Esc abandons a half-drawn shape. (Switching tools remounts this component
  // via its `key`, which clears the same state.)
  useEffect(() => {
    if (tool === 'cursor') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPending(null);
        setTextAt(null);
        onToolDone();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, onToolDone]);

  if (!handle) return null;

  const paneHeight = handle.chart.panes()[0]?.getHeight() ?? 0;
  const paneWidth = handle.chart.timeScale().width();
  const active = tool !== 'cursor';

  const local = (e: React.MouseEvent) => {
    const rect = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onClick = (e: React.MouseEvent) => {
    const { x, y } = local(e);
    const pt = toPoint(x, y);
    if (!pt) return;
    if (tool === 'hline') {
      onCommit({ id: newId(), kind: 'hline', a: pt });
      onToolDone();
    } else if (tool === 'text') {
      setTextAt({ ...pt, x, y });
    } else if (tool === 'trend' || tool === 'fib' || tool === 'measure') {
      if (!pending) {
        setPending(pt);
      } else {
        onCommit({ id: newId(), kind: tool, a: pending, b: pt });
        setPending(null);
        setCursor(null);
        onToolDone();
      }
    }
  };

  const onMove = (e: React.MouseEvent) => {
    if (!pending) return;
    const { x, y } = local(e);
    setCursor(toPoint(x, y));
  };

  const commitText = (value: string) => {
    const text = value.trim();
    if (text && textAt) onCommit({ id: newId(), kind: 'text', a: { time: textAt.time, price: textAt.price }, text });
    setTextAt(null);
    onToolDone();
  };

  const renderDrawing = (d: Drawing, preview = false) => {
    const a = toPx(d.a);
    if (!a) return null;
    const op = preview ? 0.7 : 1;
    if (d.kind === 'hline') {
      return (
        <g key={d.id} opacity={op}>
          <line x1={0} x2={paneWidth} y1={a.y} y2={a.y} className={styles.drawLine} strokeDasharray="5 4" />
          <text x={paneWidth - 6} y={a.y - 5} textAnchor="end" className={styles.drawLabel}>
            {fmt(d.a.price)}
          </text>
        </g>
      );
    }
    if (d.kind === 'text') {
      return (
        <text key={d.id} x={a.x} y={a.y} className={styles.drawText}>
          {d.text}
        </text>
      );
    }
    const b = toPx(d.b);
    if (!b) return null;
    if (d.kind === 'trend') {
      return (
        <g key={d.id} opacity={op}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.drawLine} />
          <circle cx={a.x} cy={a.y} r={3} className={styles.drawDot} />
          <circle cx={b.x} cy={b.y} r={3} className={styles.drawDot} />
        </g>
      );
    }
    if (d.kind === 'fib') {
      const x1 = Math.min(a.x, b.x);
      const x2 = Math.max(a.x, b.x);
      return (
        <g key={d.id} opacity={op}>
          {fibPrices(d.a.price, d.b.price).map((lvl) => {
            const y = handle.price.priceToCoordinate(lvl.price);
            if (y === null) return null;
            return (
              <g key={lvl.ratio}>
                <line x1={x1} x2={x2} y1={y} y2={y} className={styles.drawFib} />
                <text x={x1 + 4} y={y - 3} className={styles.drawLabel}>
                  {lvl.ratio} ({fmt(lvl.price)})
                </text>
              </g>
            );
          })}
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.drawFibGuide} />
        </g>
      );
    }
    // measure
    const m = measure(
      { price: d.a.price, index: indexByTime.get(d.a.time) ?? 0 },
      { price: d.b.price, index: indexByTime.get(d.b.time) ?? 0 }
    );
    const up = m.change >= 0;
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x);
    const h = Math.abs(a.y - b.y);
    const label = `${signed(m.change)} (${signed(m.percent)}%) · ${m.bars} bars`;
    return (
      <g key={d.id} opacity={op}>
        <rect x={left} y={top} width={w} height={h} className={up ? styles.measureUp : styles.measureDown} />
        <rect x={left + w / 2 - label.length * 3.4} y={top + h / 2 - 11} width={label.length * 6.8} height={22} rx={6} className={styles.measureTag} />
        <text x={left + w / 2} y={top + h / 2 + 4} textAnchor="middle" className={styles.measureText}>
          {label}
        </text>
      </g>
    );
  };

  const previewShape: Drawing | null =
    pending && cursor && (tool === 'trend' || tool === 'fib' || tool === 'measure')
      ? { id: 'preview', kind: tool, a: pending, b: cursor }
      : null;

  return (
    <div
      ref={rootRef}
      className={`${styles.overlay} ${active ? styles.overlayActive : ''}`}
      style={{ width: paneWidth, height: paneHeight }}
      onClick={active ? onClick : undefined}
      onMouseMove={active ? onMove : undefined}
    >
      <svg width={paneWidth} height={paneHeight} className={styles.overlaySvg}>
        {drawings.map((d) => renderDrawing(d))}
        {previewShape && renderDrawing(previewShape, true)}
      </svg>
      {textAt && (
        <input
          autoFocus
          className={styles.textInput}
          style={{ left: textAt.x, top: textAt.y }}
          placeholder="Type a note, press Enter"
          maxLength={80}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') {
              setTextAt(null);
              onToolDone();
            }
          }}
        />
      )}
    </div>
  );
}
