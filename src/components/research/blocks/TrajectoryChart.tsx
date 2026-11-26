'use client';

import { useState } from 'react';
import type { TrajectoryChartBlock } from '@/lib/research/blocks';
import { formatNumber } from '@/lib/research/formatters';
import { trajectoryGeometry } from '@/lib/research/trajectory';
import { seriesColor } from './palette';
import styles from './blocks.module.css';

const BOX = { width: 900, height: 340, pad: { top: 28, right: 24, bottom: 34, left: 64 } } as const;

const shown = (v: number | null): string => (v === null ? 'no data' : formatNumber(v, Number.isInteger(v) ? 0 : 1));

/** Every compared company on one chart, with a switch between metrics; the projected years are dashed and sit after a divider. */
export function TrajectoryChart({ block }: { readonly block: TrajectoryChartBlock }) {
  const [viewKey, setViewKey] = useState(block.views[0]?.key ?? '');
  const [hover, setHover] = useState<number | null>(null);
  const view = block.views.find((v) => v.key === viewKey) ?? block.views[0];
  if (!view) return null;
  const g = trajectoryGeometry(block, view, BOX);
  const step = (BOX.width - BOX.pad.left - BOX.pad.right) / Math.max(block.labels.length - 1, 1);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * BOX.width;
    setHover(Math.min(block.labels.length - 1, Math.max(0, Math.round((x - BOX.pad.left) / step))));
  };

  return (
    <figure className={styles.trajectory}>
      <div className={styles.trajectoryHead}>
        <figcaption className={styles.chartTitle}>{block.title} <span className={styles.chartUnit}>{view.unit}</span></figcaption>
        <div className={styles.trajectoryTabs} role="tablist" aria-label="Metric">
          {block.views.map((v) => (
            <button key={v.key} type="button" role="tab" aria-selected={v.key === view.key} className={styles.trajectoryTab} data-active={v.key === view.key} onClick={() => setViewKey(v.key)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {block.note && <p className={styles.tableNote}>{block.note}</p>}
      <div className={styles.trajectoryPlot}>
        <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} role="img" aria-label={`${block.title}: ${view.label}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {g.ticks.map((t) => (
            <g key={t}>
              <line x1={BOX.pad.left} x2={BOX.width - BOX.pad.right} y1={g.yFor(t)} y2={g.yFor(t)} className={styles.gridLine} />
              <text x={BOX.pad.left - 8} y={g.yFor(t) + 4} textAnchor="end" className={styles.axisText}>{formatNumber(t, 0)}</text>
            </g>
          ))}
          {block.labels.map((l, i) => (
            <text key={l} x={g.xFor(i)} y={BOX.height - 10} textAnchor="middle" className={styles.axisText} data-projected={block.projectedFrom !== null && i >= block.projectedFrom}>{l}</text>
          ))}
          {g.dividerX !== null && (
            <g>
              <line x1={g.dividerX} x2={g.dividerX} y1={BOX.pad.top - 6} y2={BOX.height - BOX.pad.bottom} className={styles.dividerLine} />
              <text x={g.dividerX + 6} y={BOX.pad.top - 10} className={styles.axisText}>Forecast →</text>
            </g>
          )}
          {hover !== null && <line x1={g.xFor(hover)} x2={g.xFor(hover)} y1={BOX.pad.top} y2={BOX.height - BOX.pad.bottom} className={styles.hoverLine} />}
          {g.lines.map((line, si) => (
            <g key={line.name} stroke={seriesColor(si === 0 ? 1 : si === 1 ? 0 : si)} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round">
              {line.actual.map((d) => <path key={d} d={d} />)}
              {line.projected.map((d) => <path key={d} d={d} strokeDasharray="6 5" />)}
              {line.points.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 5 : 3} fill="var(--app-surface, #fff)" strokeWidth={2} />)}
            </g>
          ))}
        </svg>
        {hover !== null && (
          <div className={styles.trajectoryTip} style={{ left: `${((g.xFor(hover) / BOX.width) * 100).toFixed(1)}%` }} data-flip={hover > block.labels.length / 2}>
            <b>{block.labels[hover]}</b>
            {view.series.map((s, si) => (
              <span key={s.name}><i style={{ background: seriesColor(si === 0 ? 1 : si === 1 ? 0 : si) }} />{s.name}: {shown(s.values[hover] ?? null)}</span>
            ))}
          </div>
        )}
      </div>
      <ul className={styles.legend}>
        {view.series.map((s, si) => (
          <li key={s.name}><span className={styles.swatch} style={{ background: seriesColor(si === 0 ? 1 : si === 1 ? 0 : si) }} />{s.name}</li>
        ))}
        {block.projectedFrom !== null && <li><span className={styles.dashSwatch} />Projected (E)</li>}
      </ul>
    </figure>
  );
}
