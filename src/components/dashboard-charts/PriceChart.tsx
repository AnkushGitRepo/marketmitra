'use client';

import type { CandlePoint, RangeSeries } from '@/lib/dashboard/chartMath';
import { CandleChart } from './CandleChart';
import { LineChart } from './LineChart';

export type ChartKind = 'line' | 'candles';
export const CHART_KINDS: ChartKind[] = ['line', 'candles'];
export const CHART_KIND_LABELS: Record<ChartKind, string> = { line: 'Line', candles: 'Candles' };

interface PriceChartProps {
  kind: ChartKind;
  series: RangeSeries;
  candles: CandlePoint[];
  height: number;
  formatValue: (v: number) => string;
  /** Subject + range, e.g. "TCS, 1Y" — used for the screen-reader label. */
  subject: string;
  emptyText: string;
  emptyClassName?: string;
}

/** Line or candlestick price chart. Falls back to the line chart when a
 * source has no usable OHLC rows, and to the empty text when it has no
 * price data at all. */
export function PriceChart({
  kind,
  series,
  candles,
  height,
  formatValue,
  subject,
  emptyText,
  emptyClassName,
}: PriceChartProps) {
  if (kind === 'candles' && candles.length > 0) {
    return (
      <CandleChart
        candles={candles}
        height={height}
        formatValue={formatValue}
        ariaLabel={`${subject} candlestick chart`}
      />
    );
  }
  if (series.v.length > 0) {
    return (
      <LineChart series={series} height={height} formatValue={formatValue} ariaLabel={`${subject} price chart`} />
    );
  }
  return <p className={emptyClassName}>{emptyText}</p>;
}
