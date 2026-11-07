import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_POLICY } from '../policy/schema';

const policy = { ...DEFAULT_POLICY, monthlyContributionINR: 25000, dipCooldownDays: 14 };
vi.mock('../policy/store', () => ({
  getPolicy: vi.fn(async () => policy),
  hasAcknowledged: vi.fn(async () => true),
}));
vi.mock('./store', () => ({ getLastDipAt: vi.fn(async () => null), markDipServed: vi.fn(async () => undefined) }));
vi.mock('@/lib/dashboard/fundamentalsApi', () => ({
  getPrices: vi.fn(async () => [
    { trade_date: '2026-11-04', close: '100' },
    { trade_date: '2026-11-05', close: '95' },
  ]),
}));
vi.mock('../performance/service', () => ({ BENCHMARK_SYMBOL: 'NIFTYBEES' }));
vi.mock('../chatTools', () => ({ buildAdvisorChatTools: vi.fn(() => ({ advisor_current_plan: {} })) }));

import { getLastDipAt, markDipServed } from './store';
import { getPolicy } from '../policy/store';
import { prepareAdvisorChat } from './chat';

const NOW = new Date('2026-11-10T00:00:00Z');

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.mocked(getLastDipAt).mockResolvedValue(null);
});

describe('prepareAdvisorChat', () => {
  it('does nothing when the flag is off — chat is untouched', async () => {
    vi.stubEnv('ADVISOR_MODE', '');
    expect(await prepareAdvisorChat('local', 'should I buy the dip?', NOW)).toBeNull();
    expect(markDipServed).not.toHaveBeenCalled();
  });

  it('does nothing when no policy is saved', async () => {
    vi.stubEnv('ADVISOR_MODE', 'enabled');
    vi.mocked(getPolicy).mockResolvedValueOnce(null);
    expect(await prepareAdvisorChat('local', 'hi', NOW)).toBeNull();
  });

  it('adds the policy context and read-only tools for an ordinary question', async () => {
    vi.stubEnv('ADVISOR_MODE', 'enabled');
    const p = await prepareAdvisorChat('local', 'what is my plan?', NOW);
    expect(p?.systemAddendum).toMatch(/INVESTMENT POLICY/);
    expect(p?.advisorToolsOnly).toBe(false);
    expect(p?.blockedReply).toBeNull();
    expect(markDipServed).not.toHaveBeenCalled();
  });

  it('serves the first dip question from the policy, restricts tools, and starts the cooldown', async () => {
    vi.stubEnv('ADVISOR_MODE', 'enabled');
    const p = await prepareAdvisorChat('local', 'Should I buy the dip?', NOW);
    expect(p?.blockedReply).toBeNull();
    expect(p?.advisorToolsOnly).toBe(true);
    expect(p?.systemAddendum).toMatch(/Do not recommend buying more/);
    expect(markDipServed).toHaveBeenCalledWith('local', NOW);
  });

  it('answers a repeat dip question inside the cooldown with a fixed policy reply and does not extend it', async () => {
    vi.stubEnv('ADVISOR_MODE', 'enabled');
    vi.mocked(getLastDipAt).mockResolvedValue('2026-11-05T00:00:00.000Z');
    const p = await prepareAdvisorChat('local', 'Should I buy the dip?', NOW);
    expect(p?.blockedReply).toMatch(/won't generate another/);
    expect(p?.blockedReply).toMatch(/no action is required/);
    expect(markDipServed).not.toHaveBeenCalled();
  });

  it('engages again once the cooldown has passed', async () => {
    vi.stubEnv('ADVISOR_MODE', 'enabled');
    vi.mocked(getLastDipAt).mockResolvedValue('2026-10-01T00:00:00.000Z');
    const p = await prepareAdvisorChat('local', 'is it a good time to buy?', NOW);
    expect(p?.blockedReply).toBeNull();
    expect(markDipServed).toHaveBeenCalled();
  });
});
