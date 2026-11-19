import { describe, expect, it } from 'vitest';
import { INDICATORS } from '@/components/pro-chart/constants';
import {
  BUILT_IN_SETUPS,
  MAX_CUSTOM_SETUPS,
  addCustomSetup,
  matchingSetupId,
  parseCustomSetups,
} from './indicatorSetups';

const ids = INDICATORS.map((i) => i.id);

describe('built-in setups', () => {
  it('use only known indicators, once each, with unique ids', () => {
    for (const s of BUILT_IN_SETUPS) {
      expect(s.indicators.length).toBeGreaterThan(0);
      expect(new Set(s.indicators).size).toBe(s.indicators.length);
      for (const id of s.indicators) expect(ids).toContain(id);
    }
    expect(new Set(BUILT_IN_SETUPS.map((s) => s.id)).size).toBe(BUILT_IN_SETUPS.length);
  });
});

describe('matchingSetupId', () => {
  const setup = BUILT_IN_SETUPS[0];

  it('matches the same indicators in any order, with the same effective settings', () => {
    expect(matchingSetupId([setup], [...setup.indicators].reverse(), setup.params)).toBe(setup.id);
  });

  it('does not match when an indicator differs or a setting differs', () => {
    expect(matchingSetupId([setup], setup.indicators.slice(1), setup.params)).toBeNull();
    const first = setup.indicators.find((i) => i === 'rsi' || i === 'sma50') ?? setup.indicators[0];
    const changed = { ...setup.params, [first]: { period: 7 } };
    expect(matchingSetupId([setup], setup.indicators, changed)).toBeNull();
  });

  it('treats a stored default as no setting', () => {
    expect(
      matchingSetupId([setup], setup.indicators, { ...setup.params, rsi: { period: 14 } }),
    ).toBe(setup.id);
  });
});

describe('addCustomSetup', () => {
  it('adds one, trimmed, keeping only indicators that are on and the settings that differ from the default', () => {
    const out = addCustomSetup(
      [],
      '  Mine  ',
      ['rsi', 'macd'],
      { rsi: { period: 9 }, atr: { period: 5 } },
      'id1',
    );
    expect(out).toEqual([
      { id: 'id1', name: 'Mine', indicators: ['rsi', 'macd'], params: { rsi: { period: 9 } } },
    ]);
  });

  it('replaces a setup of the same name instead of duplicating it', () => {
    const first = addCustomSetup([], 'Mine', ['rsi'], {}, 'a');
    const second = addCustomSetup(first, 'mine', ['macd'], {}, 'b');
    expect(second).toHaveLength(1);
    expect(second[0].indicators).toEqual(['macd']);
  });

  it('ignores an empty name or no indicators, and caps the count', () => {
    expect(addCustomSetup([], '   ', ['rsi'], {}, 'a')).toEqual([]);
    expect(addCustomSetup([], 'x', [], {}, 'a')).toEqual([]);
    let list = addCustomSetup([], 's0', ['rsi'], {}, 'i0');
    for (let n = 1; n < MAX_CUSTOM_SETUPS + 3; n++)
      list = addCustomSetup(list, `s${n}`, ['rsi'], {}, `i${n}`);
    expect(list).toHaveLength(MAX_CUSTOM_SETUPS);
    expect(list.some((s) => s.name === `s${MAX_CUSTOM_SETUPS + 2}`)).toBe(true);
  });
});

describe('parseCustomSetups', () => {
  it('keeps valid entries and drops anything else', () => {
    const out = parseCustomSetups([
      {
        id: 'a',
        name: 'Ok',
        indicators: ['rsi', 'nope'],
        params: { rsi: { period: 9, junk: 'x' } },
      },
      { id: 'b', name: '', indicators: ['rsi'], params: {} },
      'garbage',
      { id: 'c', name: 'None', indicators: ['nope'], params: {} },
    ]);
    expect(out).toEqual([
      { id: 'a', name: 'Ok', indicators: ['rsi'], params: { rsi: { period: 9 } } },
    ]);
  });

  it('returns an empty list for non-arrays', () => {
    expect(parseCustomSetups({ a: 1 })).toEqual([]);
    expect(parseCustomSetups(null)).toEqual([]);
  });
});
