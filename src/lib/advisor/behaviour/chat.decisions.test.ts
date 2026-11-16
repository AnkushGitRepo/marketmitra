import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_POLICY } from '../policy/schema';

// The whole chain from the chat plan to the HTTP request, with only the network stubbed.

vi.mock('../policy/store', () => ({
  getPolicy: vi.fn(async () => ({ ...DEFAULT_POLICY, dipCooldownDays: 14 })),
  hasAcknowledged: vi.fn(async () => true),
}));
vi.mock('./store', () => ({ getLastDipAt: vi.fn(async () => null), markDipServed: vi.fn(async () => undefined) }));
vi.mock('@/lib/dashboard/fundamentalsApi', () => ({ getPrices: vi.fn(async () => []) }));
vi.mock('../performance/service', () => ({ BENCHMARK_SYMBOL: 'NIFTYBEES' }));
vi.mock('../chatTools', () => ({ buildAdvisorChatTools: vi.fn(() => ({})) }));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: vi.fn(async () => undefined) }));

import { markDipServed } from './store';
import { prepareAdvisorChat } from './chat';

const NOW = new Date('2026-11-16T00:00:00Z');
const gemini = { provider: 'gemini', apiKey: 'k', model: null } as const;
const verdict = (p: number) => new Response(JSON.stringify({ answers: { verdict: { type: 'noul', noul: p, confidence: Math.max(p, 1 - p) } } }), { status: 200 });

const fetchStub = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.stubEnv('ADVISOR_MODE', 'enabled');
  vi.stubGlobal('fetch', fetchStub);
  fetchStub.mockReset();
});

describe('Advisor chat with the decision model', () => {
  it('asks Google about a message the regexes miss, and restricts tools and starts the cooldown when it says yes', async () => {
    fetchStub.mockResolvedValue(verdict(0.95));
    const p = await prepareAdvisorChat('local', 'Nifty is bleeding today, is this the bottom?', NOW, gemini);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/decisions');
    expect(JSON.parse(init.body as string).input).toBe('Nifty is bleeding today, is this the bottom?');
    expect(p?.advisorToolsOnly).toBe(true);
    expect(markDipServed).toHaveBeenCalledWith('local', NOW);
  });

  it('leaves an ordinary question alone when the model says no', async () => {
    fetchStub.mockResolvedValue(verdict(0.03));
    const p = await prepareAdvisorChat('local', 'What is my asset split?', NOW, gemini);
    expect(p?.advisorToolsOnly).toBe(false);
    expect(markDipServed).not.toHaveBeenCalled();
  });

  it('makes no request when the regex already matched', async () => {
    const p = await prepareAdvisorChat('local', 'Should I buy the dip?', NOW, gemini);
    expect(fetchStub).not.toHaveBeenCalled();
    expect(p?.advisorToolsOnly).toBe(true);
  });

  it('behaves exactly as before when Google is down: the chat still works and nothing is restricted', async () => {
    fetchStub.mockRejectedValue(new Error('network down'));
    const p = await prepareAdvisorChat('local', 'Nifty is bleeding today, is this the bottom?', NOW, gemini);
    expect(p).not.toBeNull();
    expect(p?.advisorToolsOnly).toBe(false);
    expect(p?.blockedReply).toBeNull();
  });

  it('makes no request for an Anthropic or OpenRouter user', async () => {
    for (const provider of ['anthropic', 'openrouter'] as const) {
      await prepareAdvisorChat('local', 'Nifty is bleeding today, is this the bottom?', NOW, { provider, apiKey: 'k', model: null });
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
