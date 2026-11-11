import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => Promise<string | null>>(),
  getUserAiConfig: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
  validateAiKey: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
}));

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: m.getCurrentUserId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getUserAiConfig: m.getUserAiConfig }));
vi.mock('@/lib/ai/generate', () => ({ validateAiKey: m.validateAiKey }));
vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (handler: unknown) => handler }));

const { POST } = await import('./route');
const call = () => (POST as unknown as () => Promise<Response>)();

const SECRET = 'sk-super-secret-key-1234567890';

beforeEach(() => {
  vi.clearAllMocks();
  m.getCurrentUserId.mockResolvedValue('u1');
  m.getUserAiConfig.mockResolvedValue({ provider: 'gemini', apiKey: SECRET, model: 'gemini-3.8-flash' });
  m.validateAiKey.mockResolvedValue({ ok: true });
});

describe('POST /api/settings/ai/test', () => {
  it('reports success with the provider, model and a measured latency', async () => {
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ provider: 'gemini', model: 'gemini-3.8-flash' });
    expect(Number.isInteger(body.data.latencyMs)).toBe(true);
    expect(body.data.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('never puts the key in the response, on success or failure', async () => {
    const ok = JSON.stringify(await (await call()).json());
    m.validateAiKey.mockResolvedValue({ ok: false, error: 'That API key was rejected by the provider.' });
    const bad = JSON.stringify(await (await call()).json());
    expect(ok).not.toContain(SECRET);
    expect(bad).not.toContain(SECRET);
    expect(ok).not.toContain('apiKey');
  });

  it('returns the provider\'s reason with a 400 when the key is rejected', async () => {
    m.validateAiKey.mockResolvedValue({ ok: false, error: 'That API key was rejected by the provider.' });
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: 'That API key was rejected by the provider.' });
    expect(body.data.provider).toBe('gemini');
  });

  it('is 404 with a hint when no key is configured, without calling the provider', async () => {
    m.getUserAiConfig.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('no_ai_key');
    expect(m.validateAiKey).not.toHaveBeenCalled();
  });

  it('is 401 for an anonymous caller, without reading any key', async () => {
    m.getCurrentUserId.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(m.getUserAiConfig).not.toHaveBeenCalled();
  });

  it('treats a failure to read the stored key as "no key" rather than crashing', async () => {
    m.getUserAiConfig.mockRejectedValue(new Error('mongo down'));
    expect((await call()).status).toBe(404);
  });
});
