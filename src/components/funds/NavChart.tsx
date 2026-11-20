'use client';

import { useCallback, useMemo, useRef, useState, type PointerEvent } from 'react';
import { buildChart, downsample, nearestPoint, parseNavSeries, type ChartPoint } from '@/lib/funds/chart';
import { formatDate, formatNav, formatPercent } from '@/lib/funds/format';
import { NAV_RANGES, type NavPoint, type NavRange } from '@/lib/funds/types';
import styles from './NavChart.module.css';

interface NavChartProps {
  readonly schemeCode: number;
  readonly initialRange: NavRange;
  readonly initialSeries: readonly NavPoint[];
}

const WIDTH = 720;
const HEIGHT = 280;
const PAD_X = 24;
const PAD_Y = 24;
/** The left margin holds the price labels beside the line, so a label never sits on the curve. */
const PAD_LEFT = 100;
const MAX_POINTS = 360;

const RANGE_LABEL: Record<NavRange, string> = { '1m': '1M', '6m': '6M', '1y': '1Y', '3y': '3Y', '5y': '5Y', '10y': '10Y', max: 'Max' };

export function NavChart({ schemeCode, initialRange, initialSeries }: NavChartProps) {
  const [range, setRange] = useState<NavRange>(initialRange);
  const [series, setSeries] = useState<readonly NavPoint[]>(initialSeries);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<ChartPoint | null>(null);
  const requestId = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);

  const chart = useMemo(() => buildChart(downsample(series, MAX_POINTS), WIDTH, HEIGHT, PAD_X, PAD_LEFT), [series]);

  const selectRange = useCallback(
    async (next: NavRange) => {
      setHover(null);
      const id = ++requestId.current;
      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch(`/api/funds/${schemeCode}/nav?range=${next}`);
        if (id !== requestId.current) return;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = parseNavSeries(await response.json());
        if (id !== requestId.current) return;
        if (!parsed) throw new Error('unexpected NAV response');
        // Only a range that actually loaded becomes the shown range, so the label never describes other data.
        setSeries(parsed);
        setRange(next);
      } catch {
        if (id === requestId.current) setFailed(true);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [schemeCode],
  );

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !chart || loading) return;
    const box = svg.getBoundingClientRect();
    if (box.width === 0) return;
    setHover(nearestPoint(chart.points, ((event.clientX - box.left) / box.width) * WIDTH));
  };

  const first = series[0];
  const last = series[series.length - 1];
  const shown = hover ?? chart?.points[chart.points.length - 1] ?? null;
  const tone = (chart?.change ?? 0) >= 0 ? styles.up : styles.down;

  return (
    <section className={styles.card} aria-label="NAV history">
      <div className={styles.head}>
        <h2 className={styles.title}>NAV history</h2>
        <div className={styles.ranges} role="group" aria-label="Chart range">
          {NAV_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={`${styles.range} ${r === range ? styles.rangeActive : ''}`}
              aria-pressed={r === range}
              disabled={loading}
              onClick={() => void selectRange(r)}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <p className={styles.error} role="alert">
          Could not load that range. Showing {RANGE_LABEL[range]} instead.
        </p>
      )}

      {chart && first && last ? (
        <div className={`${styles.plot} ${loading ? styles.loading : ''}`}>
          <svg
            ref={svgRef}
            className={styles.svg}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`NAV from ${formatNav(first.nav)} on ${formatDate(first.date)} to ${formatNav(last.nav)} on ${formatDate(last.date)}, ${formatPercent(chart.change)} over the period`}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
          >
            <text className={styles.axis} x={PAD_LEFT - 8} y={PAD_Y + 4} textAnchor="end">{formatNav(chart.max)}</text>
            <text className={styles.axis} x={PAD_LEFT - 8} y={HEIGHT - PAD_Y + 4} textAnchor="end">{formatNav(chart.min)}</text>
            <text className={styles.axis} x={PAD_LEFT} y={HEIGHT - 6}>{formatDate(first.date)}</text>
            <text className={styles.axis} x={WIDTH - PAD_X} y={HEIGHT - 6} textAnchor="end">{formatDate(last.date)}</text>
            <path className={`${styles.line} ${tone}`} d={chart.path} />
            {hover && (
              <>
                <line className={styles.guide} x1={hover.x} x2={hover.x} y1={PAD_Y - 10} y2={HEIGHT - PAD_Y} />
                <circle className={styles.dot} cx={hover.x} cy={hover.y} r={4} />
              </>
            )}
          </svg>
          <p className={styles.readout} aria-live="off">
            {shown ? `${formatDate(shown.date)} · ${formatNav(shown.nav)}` : ''}
            {!hover && ` · ${formatPercent(chart.change)} over ${RANGE_LABEL[range]}`}
          </p>
        </div>
      ) : (
        <p className={styles.empty}>{loading ? 'Loading…' : 'Not enough NAV history stored for this range yet.'}</p>
      )}
      <p className={styles.note}>NAV as published. A unit split or consolidation shows as a step; returns above are adjusted for it.</p>
    </section>
  );
}
