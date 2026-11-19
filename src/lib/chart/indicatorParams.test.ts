import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, indicatorTitle, resolveParams } from './indicatorParams';

describe('resolveParams', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(resolveParams('rsi', undefined)).toEqual({ period: 14 });
    expect(resolveParams('macd', {})).toEqual({ fast: 12, slow: 26, signal: 9 });
    expect(resolveParams('obv', { period: 5 })).toEqual({});
  });

  it('keeps valid values, rounds whole-number settings and clamps to the allowed range', () => {
    expect(resolveParams('rsi', { period: 21.6 })).toEqual({ period: 22 });
    expect(resolveParams('rsi', { period: 1 })).toEqual({ period: 2 });
    expect(resolveParams('ema50', { period: 9999 })).toEqual({ period: 500 });
  });

  it('keeps a decimal where the setting allows one (Bollinger multiplier)', () => {
    expect(resolveParams('bb', { period: 20, mult: 2.5 })).toEqual({ period: 20, mult: 2.5 });
  });

  it('falls back to the default for anything that is not a finite number, and ignores unknown keys', () => {
    expect(resolveParams('rsi', { period: Number.NaN, junk: 3 } as never)).toEqual({ period: 14 });
    expect(resolveParams('rsi', { period: '7' } as never)).toEqual({ period: 14 });
  });

  it('keeps MACD fast below slow', () => {
    expect(resolveParams('macd', { fast: 30, slow: 20, signal: 9 })).toEqual({
      fast: 30,
      slow: 31,
      signal: 9,
    });
  });
});

describe('indicatorTitle', () => {
  it('names the indicator with the settings in use', () => {
    expect(indicatorTitle('rsi', { period: 21 })).toBe('RSI (21)');
    expect(indicatorTitle('macd', undefined)).toBe('MACD (12, 26, 9)');
    expect(indicatorTitle('ema50', { period: 55 })).toBe('EMA 55');
    expect(indicatorTitle('bb', { period: 20, mult: 2.5 })).toBe('Bollinger (20, 2.5)');
    expect(indicatorTitle('obv', undefined)).toBe('OBV');
    expect(indicatorTitle('volume', undefined)).toBe('Volume');
  });
});

describe('DEFAULT_PARAMS', () => {
  it('matches what the chart drew before settings existed', () => {
    expect(DEFAULT_PARAMS.stoch).toEqual({ period: 14, smoothK: 3, smoothD: 3 });
    expect(DEFAULT_PARAMS.supertrend).toEqual({ period: 10, mult: 3 });
    expect(DEFAULT_PARAMS.sma200).toEqual({ period: 200 });
  });
});
