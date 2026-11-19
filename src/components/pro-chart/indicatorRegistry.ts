// What each indicator draws, as data: the chart canvas, the legend and the pane labels all read this one description,
// so a colour or a period is defined once (#232). Volume is not here: it has its own scale and is drawn by the canvas.

import {
  atr,
  bollinger,
  donchian,
  ema,
  macd,
  obv,
  rsi,
  sma,
  stochastic,
  supertrend,
  type Series,
} from '@/lib/chart/indicators';
import type { Bar } from '@/lib/chart/bars';
import {
  resolveParams,
  type IndicatorParams,
  type StoredParams,
} from '@/lib/chart/indicatorParams';
import { INDICATOR_COLORS, type IndicatorId } from './constants';

export interface LineOutput {
  /** Short name for the value in the legend (`K`, `Signal`); empty when the indicator has one line. */
  name: string;
  color: string;
  values: Series;
  dashed?: boolean;
  /** Per-point colours, for a line that changes colour as it runs (Supertrend: green in an uptrend, red in a downtrend). */
  pointColors?: string[];
}

export interface HistogramOutput {
  name: string;
  values: Series;
}

export interface IndicatorOutput {
  lines: LineOutput[];
  histogram?: HistogramOutput;
  /** Dashed reference lines (RSI 30/70, Stochastic 20/80). */
  levels?: number[];
}

type NonVolume = Exclude<IndicatorId, 'volume'>;

const maLine = (values: Series, color: string): IndicatorOutput => ({
  lines: [{ name: '', color, values }],
});

export function computeIndicator(
  id: NonVolume,
  bars: Bar[],
  stored?: StoredParams[IndicatorId],
): IndicatorOutput {
  const p: IndicatorParams = resolveParams(id, stored);
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  switch (id) {
    case 'sma20':
      return maLine(sma(close, p.period), INDICATOR_COLORS.sma20);
    case 'sma50':
      return maLine(sma(close, p.period), INDICATOR_COLORS.sma50);
    case 'sma100':
      return maLine(sma(close, p.period), INDICATOR_COLORS.sma100);
    case 'sma200':
      return maLine(sma(close, p.period), INDICATOR_COLORS.sma200);
    case 'ema20':
      return maLine(ema(close, p.period), INDICATOR_COLORS.ema20);
    case 'ema50':
      return maLine(ema(close, p.period), INDICATOR_COLORS.ema50);
    case 'ema100':
      return maLine(ema(close, p.period), INDICATOR_COLORS.ema100);
    case 'ema200':
      return maLine(ema(close, p.period), INDICATOR_COLORS.ema200);
    case 'bb': {
      const { upper, mid, lower } = bollinger(close, p.period, p.mult);
      return {
        lines: [
          { name: 'Upper', color: INDICATOR_COLORS.bb, values: upper },
          { name: 'Mid', color: INDICATOR_COLORS.bb, values: mid, dashed: true },
          { name: 'Lower', color: INDICATOR_COLORS.bb, values: lower },
        ],
      };
    }
    case 'donchian': {
      const { upper, mid, lower } = donchian(high, low, p.period);
      return {
        lines: [
          { name: 'Upper', color: INDICATOR_COLORS.donchian, values: upper },
          { name: 'Mid', color: INDICATOR_COLORS.donchian, values: mid, dashed: true },
          { name: 'Lower', color: INDICATOR_COLORS.donchian, values: lower },
        ],
      };
    }
    case 'supertrend': {
      const { line, up } = supertrend(high, low, close, p.period, p.mult);
      return {
        lines: [
          {
            name: '',
            color: INDICATOR_COLORS.supertrendUp,
            values: line,
            pointColors: up.map((u) =>
              u === false ? INDICATOR_COLORS.supertrendDown : INDICATOR_COLORS.supertrendUp,
            ),
          },
        ],
      };
    }
    case 'rsi':
      return {
        lines: [{ name: '', color: INDICATOR_COLORS.rsi, values: rsi(close, p.period) }],
        levels: [30, 70],
      };
    case 'macd': {
      const { line, signal, histogram } = macd(close, p.fast, p.slow, p.signal);
      return {
        lines: [
          { name: 'MACD', color: INDICATOR_COLORS.macdLine, values: line },
          { name: 'Signal', color: INDICATOR_COLORS.macdSignal, values: signal },
        ],
        histogram: { name: 'Hist', values: histogram },
      };
    }
    case 'stoch': {
      const { k, d } = stochastic(high, low, close, p.period, p.smoothK, p.smoothD);
      return {
        lines: [
          { name: '%K', color: INDICATOR_COLORS.stochK, values: k },
          { name: '%D', color: INDICATOR_COLORS.stochD, values: d },
        ],
        levels: [20, 80],
      };
    }
    case 'atr':
      return {
        lines: [{ name: '', color: INDICATOR_COLORS.atr, values: atr(high, low, close, p.period) }],
      };
    case 'obv':
      return {
        lines: [
          {
            name: '',
            color: INDICATOR_COLORS.obv,
            values: obv(
              close,
              bars.map((b) => b.volume),
            ),
          },
        ],
      };
  }
}
