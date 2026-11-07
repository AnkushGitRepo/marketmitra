import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY } from '../policy/schema';
import { assessMarket, checkCooldown, dipCooldownReply, isDipRequest, policyPromptBlock } from './guard';

const series = (closes: number[]) => closes.map((close, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, close }));

describe('assessMarket', () => {
  it('is calm in a quiet market', () => {
    const m = assessMarket(series([100, 101, 102, 101.5]))!;
    expect(m.stressed).toBe(false);
  });
  it('flags a sharp one-day fall', () => {
    const m = assessMarket(series([100, 100, 100, 96]))!;
    expect(m.dayChangePct).toBeCloseTo(-4);
    expect(m.stressed).toBe(true);
  });
  it('flags a deep drawdown from the high even on a flat day', () => {
    const m = assessMarket(series([100, 110, 95, 95]))!;
    expect(m.drawdownPct).toBeCloseTo(13.64, 1);
    expect(m.stressed).toBe(true);
  });
  it('is null with too little data', () => {
    expect(assessMarket(series([100]))).toBeNull();
  });
});

describe('isDipRequest', () => {
  it.each([
    'Should I buy the dip?',
    'market crashed, is it a good time to buy?',
    'the market is falling, should I invest more now',
    'time to add more on this correction?',
    'Is it a good time to invest?',
  ])('detects: %s', (t) => expect(isDipRequest(t)).toBe(true));
  it.each([
    'What does the policy say about rebalancing?',
    'Show my plan for this month',
    'Tell me about the history of the dip in the 2008 crash',
    'How is TCS doing?',
  ])('ignores: %s', (t) => expect(isDipRequest(t)).toBe(false));
});

describe('checkCooldown', () => {
  const now = '2026-11-10T00:00:00.000Z';
  it('blocks inside the window and says when it ends', () => {
    const c = checkCooldown({ lastDipAt: '2026-11-05T00:00:00.000Z', now, cooldownDays: 14 });
    expect(c.blocked).toBe(true);
    expect(c.nextAllowedAt).toBe('2026-11-19T00:00:00.000Z');
  });
  it('allows after the window', () => {
    expect(checkCooldown({ lastDipAt: '2026-10-01T00:00:00.000Z', now, cooldownDays: 14 }).blocked).toBe(false);
  });
  it('allows the first ask and a zero cooldown', () => {
    expect(checkCooldown({ lastDipAt: null, now, cooldownDays: 14 }).blocked).toBe(false);
    expect(checkCooldown({ lastDipAt: '2026-11-09T00:00:00.000Z', now, cooldownDays: 0 }).blocked).toBe(false);
  });
});

describe('policy wording', () => {
  const policy = { ...DEFAULT_POLICY, monthlyContributionINR: 25000, maxTolerableDrawdownPct: 30 };
  const mild = { dayChangePct: -3, drawdownPct: 12, stressed: true };
  const deep = { dayChangePct: -3, drawdownPct: 35, stressed: true };

  it('references the user\'s own drawdown tolerance and says no action is needed', () => {
    const r = dipCooldownReply(policy, mild, '2026-11-19T00:00:00.000Z');
    expect(r).toMatch(/up to 30%/);
    expect(r).toMatch(/no action is required/);
    expect(r).toMatch(/2026-11-19/);
    expect(r).not.toMatch(/\bbuy (more|now)\b/i);
  });
  it('is candid when the fall exceeds the stated tolerance, still without new advice', () => {
    expect(dipCooldownReply(policy, deep, '2026-11-19T00:00:00.000Z')).toMatch(/beyond that range/);
  });
  it('instructs the model not to recommend during stress or a dip question', () => {
    const block = policyPromptBlock(policy, mild, { dipRequest: true });
    expect(block).toMatch(/do NOT produce new buy or sell/);
    expect(block).toMatch(/Do not recommend buying more/);
    const calm = policyPromptBlock(policy, { dayChangePct: 0, drawdownPct: 1, stressed: false }, { dipRequest: false });
    expect(calm).not.toMatch(/under stress/);
  });
});
