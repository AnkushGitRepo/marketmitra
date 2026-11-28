import { describe, expect, it } from 'vitest';
import { DEFAULT_PORTFOLIO_RULES } from './portfolioRules';
import { draftFromParams, paramsFromDraft, parseLevels } from './rulesForm';

describe('parseLevels', () => {
  it('sorts, dedupes and drops junk and out-of-range values', () => {
    expect(parseLevels('200, 100 100 abc -5 300%', 1000)).toEqual([100, 200, 300]);
    expect(parseLevels('10, 150', 100)).toEqual([10]);
  });
  it('keeps at most six', () => expect(parseLevels('1 2 3 4 5 6 7 8', 100)).toHaveLength(6));
});

describe('draft', () => {
  it('starts with every rule off but shows the suggested values when nothing is saved', () => {
    const d = draftFromParams(null, DEFAULT_PORTFOLIO_RULES);
    expect([d.milestones, d.drawdown, d.weight, d.high]).toEqual([false, false, false, false]);
    expect(d.milestoneText).toBe('100, 200, 300');
  });
  it('round-trips saved rules', () => {
    const saved = { profitMilestonesPct: [50], costDrawdownPct: [], maxPositionWeightPct: 25, week52High: true };
    const r = paramsFromDraft(draftFromParams(saved, DEFAULT_PORTFOLIO_RULES));
    expect(r).toEqual({ ok: true, params: saved });
  });
  it('rejects a switched-on rule with no usable number', () => {
    const d = { ...draftFromParams(null, DEFAULT_PORTFOLIO_RULES), milestones: true, milestoneText: 'abc' };
    expect(paramsFromDraft(d).ok).toBe(false);
  });
});
