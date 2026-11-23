import { beforeEach, describe, expect, it, vi } from 'vitest';

const userId = vi.hoisted(() => ({ value: 'u1' as string | null }));
const prefs = vi.hoisted(() => ({ agents: { auto: true }, onboarding: { riskProfile: null as string | null, completed: false, dismissed: false } }));
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => userId.value }));
const updatePreferences = vi.hoisted(() => vi.fn(async (_u: string, patch: { onboarding?: object }) => ({ ...prefs, onboarding: { ...prefs.onboarding, ...patch.onboarding } })));
vi.mock('@/lib/preferences/store', () => ({ getPreferences: async () => prefs, updatePreferences }));
const listHoldings = vi.hoisted(() => vi.fn(async () => [{ symbol: 'TCS' }, { symbol: 'INFY' }]));
vi.mock('@/lib/holdings', () => ({ listHoldings }));
const getAiSettingsView = vi.hoisted(() => vi.fn(async () => ({ provider: 'gemini' }) as unknown));
vi.mock('@/lib/userSettings', () => ({ getAiSettingsView }));
vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (h: unknown) => h }));

const { POST } = await import('./route');
const post = (body: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));
const json = async (r: Response) => (await r.json()) as { success: boolean; data: Record<string, unknown> | null; error: string | null };

beforeEach(() => {
  vi.clearAllMocks();
  userId.value = 'u1';
  prefs.agents.auto = true;
  getAiSettingsView.mockResolvedValue({ provider: 'gemini' });
});

describe('POST /api/onboarding', () => {
  it('requires a signed-in user', async () => {
    userId.value = null;
    expect((await post({ status: 'dismissed' })).status).toBe(401);
  });

  it('rejects an unknown profile, an unknown status and extra keys', async () => {
    expect((await post({ riskProfile: 'yolo' })).status).toBe(422);
    expect((await post({ status: 'maybe' })).status).toBe(422);
    expect((await post({ status: 'dismissed', extra: 1 })).status).toBe(422);
    expect((await post({})).status).toBe(422);
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it('saves a risk profile alone without finishing the flow', async () => {
    const res = await post({ riskProfile: 'aggressive' });
    expect(res.status).toBe(200);
    expect(updatePreferences).toHaveBeenCalledWith('u1', { onboarding: { riskProfile: 'aggressive' } });
  });

  it('marks it completed and reports analysts queued only when there is an AI key and analysts are on', async () => {
    const body = await json(await post({ status: 'completed' }));
    expect(updatePreferences).toHaveBeenCalledWith('u1', { onboarding: { completed: true } });
    expect(body.data).toMatchObject({ holdings: 2, analystsQueued: 2, completed: true });
  });

  it('reports no analysts without a key, or when automatic analysts are off', async () => {
    getAiSettingsView.mockResolvedValue(null);
    expect((await json(await post({ status: 'completed' }))).data).toMatchObject({ analystsQueued: 0, hasAiKey: false });
    getAiSettingsView.mockResolvedValue({ provider: 'gemini' });
    prefs.agents.auto = false;
    expect((await json(await post({ status: 'completed' }))).data).toMatchObject({ analystsQueued: 0 });
  });

  it('marks it dismissed', async () => {
    await post({ status: 'dismissed' });
    expect(updatePreferences).toHaveBeenCalledWith('u1', { onboarding: { dismissed: true } });
  });

  it('still answers when the summary lookups fail, and answers 500 only when the save fails', async () => {
    listHoldings.mockRejectedValueOnce(new Error('db'));
    expect((await post({ status: 'dismissed' })).status).toBe(200);
    updatePreferences.mockRejectedValueOnce(new Error('db'));
    expect((await post({ status: 'dismissed' })).status).toBe(500);
  });
});
