import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUserId = vi.fn();
const getUserAiConfig = vi.fn();
const listModels = vi.fn();
vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (h: unknown) => h }));
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: (...a: unknown[]) => getCurrentUserId(...a) }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getUserAiConfig: (...a: unknown[]) => getUserAiConfig(...a) }));
vi.mock('@/lib/ai/modelList', async (orig) => ({ ...(await orig<typeof import('@/lib/ai/modelList')>()), listModels: (...a: unknown[]) => listModels(...a) }));

import { POST } from './route';

const call = (body: unknown) => (POST as unknown as (r: Request) => Promise<Response>)(new Request('http://x/api/settings/ai/models', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /api/settings/ai/models', () => {
  beforeEach(() => {
    getCurrentUserId.mockReset().mockResolvedValue('u1');
    getUserAiConfig.mockReset().mockResolvedValue({ provider: 'groq', apiKey: 'SAVED', model: null });
    listModels.mockReset().mockResolvedValue({ source: 'live', models: [] });
  });

  it('needs a signed-in user and a known provider', async () => {
    getCurrentUserId.mockResolvedValue(null);
    expect((await call({ provider: 'groq' })).status).toBe(401);
    getCurrentUserId.mockResolvedValue('u1');
    expect((await call({ provider: 'nope' })).status).toBe(422);
    expect((await call(null)).status).toBe(422);
  });

  it('uses a key from the request, or the saved key for the same provider, and never returns the key', async () => {
    const typed = await call({ provider: 'groq', apiKey: 'TYPED' });
    expect(listModels).toHaveBeenLastCalledWith('groq', 'TYPED', 'u1');
    expect(JSON.stringify(await typed.json())).not.toContain('TYPED');
    await call({ provider: 'groq' });
    expect(listModels).toHaveBeenLastCalledWith('groq', 'SAVED', 'u1');
  });

  it('does not use a saved key for a different provider; it answers with the curated list instead', async () => {
    const out = await (await call({ provider: 'mistral' })).json();
    expect(listModels).not.toHaveBeenCalled();
    expect(out.data.source).toBe('curated');
  });

  it('asks for the OpenRouter list without any key, since that list is public', async () => {
    await call({ provider: 'openrouter' });
    expect(listModels).toHaveBeenLastCalledWith('openrouter', null, 'u1');
  });
});
