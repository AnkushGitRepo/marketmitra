import { beforeEach, describe, expect, it, vi } from 'vitest';

const listHoldings = vi.hoisted(() => vi.fn<(u: string) => Promise<unknown[]>>());
vi.mock('@/lib/holdings', () => ({ listHoldings }));

import { resolveOnboardingGate } from './gate';

const flags = (over: Partial<{ completed: boolean; dismissed: boolean }> = {}) => ({ riskProfile: null, completed: false, dismissed: false, ...over });

beforeEach(() => vi.clearAllMocks());

describe('resolveOnboardingGate', () => {
  it('does nothing without a user, and never queries holdings once a flag is set', async () => {
    expect(await resolveOnboardingGate(null, flags())).toBe('skip');
    expect(await resolveOnboardingGate('u1', flags({ completed: true }))).toBe('skip');
    expect(await resolveOnboardingGate('u1', flags({ dismissed: true }))).toBe('skip');
    expect(listHoldings).not.toHaveBeenCalled();
  });
  it('redirects a flagless user with no holdings', async () => {
    listHoldings.mockResolvedValue([]);
    expect(await resolveOnboardingGate('u1', flags())).toBe('redirect');
  });
  it('reports an existing user so the caller can stamp them completed', async () => {
    listHoldings.mockResolvedValue([{}]);
    expect(await resolveOnboardingGate('u1', flags())).toBe('existing');
  });
  it('fails open when holdings cannot be read', async () => {
    listHoldings.mockRejectedValue(new Error('db down'));
    expect(await resolveOnboardingGate('u1', flags())).toBe('skip');
  });
});
