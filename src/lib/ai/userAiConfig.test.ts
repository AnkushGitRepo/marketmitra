import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiSettings } from '@/lib/userSettings';

const getAiSettings = vi.fn<(userId: string) => Promise<AiSettings | null>>();
const isHosted = vi.fn<() => boolean>();

vi.mock('@/lib/userSettings', () => ({ getAiSettings }));
vi.mock('@/lib/deployment-mode', () => ({ isHosted }));

const { getAiConfig, getUserAiConfig, resolveHasAiKey } = await import('./userAiConfig');

const stored: AiSettings = {
  provider: 'gemini',
  apiKey: 'user-key',
  model: null,
  updatedAt: new Date(0),
};

beforeEach(() => {
  getAiSettings.mockReset();
  isHosted.mockReset();
  isHosted.mockReturnValue(true);
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
});

afterEach(() => {
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
});

describe('getAiConfig', () => {
  it('returns the user stored key when present', async () => {
    getAiSettings.mockResolvedValue(stored);
    expect(await getAiConfig('u1')).toEqual({ provider: 'gemini', apiKey: 'user-key', model: null });
  });

  it('returns null when the user genuinely has no stored key', async () => {
    getAiSettings.mockResolvedValue(null);
    expect(await getAiConfig('u1', { allowEnv: false })).toBeNull();
  });

  it('retries when getAiSettings throws (cold-start DB blip) and does NOT swallow it as "no key"', async () => {
    getAiSettings
      .mockRejectedValueOnce(new Error('server selection timed out'))
      .mockRejectedValueOnce(new Error('server selection timed out'))
      .mockResolvedValueOnce(stored);
    expect(await getAiConfig('u1')).toEqual({ provider: 'gemini', apiKey: 'user-key', model: null });
    expect(getAiSettings).toHaveBeenCalledTimes(3);
  });

  it('lets the last error bubble when every attempt throws', async () => {
    getAiSettings.mockRejectedValue(new Error('db down'));
    await expect(getAiConfig('u1')).rejects.toThrow('db down');
    expect(getAiSettings).toHaveBeenCalledTimes(3);
  });

  it('falls back to the deployment env key when allowEnv and no stored key', async () => {
    getAiSettings.mockResolvedValue(null);
    process.env.AI_PROVIDER = 'anthropic';
    process.env.AI_API_KEY = 'env-key';
    expect(await getAiConfig('u1', { allowEnv: true })).toEqual({
      provider: 'anthropic',
      apiKey: 'env-key',
      model: null,
    });
  });

  it('reads any of the supported providers from the env, and ignores an unknown one', async () => {
    getAiSettings.mockResolvedValue(null);
    process.env.AI_API_KEY = 'env-key';
    process.env.AI_PROVIDER = 'groq';
    process.env.AI_MODEL = 'openai/gpt-oss-120b';
    expect(await getAiConfig('u1', { allowEnv: true })).toEqual({ provider: 'groq', apiKey: 'env-key', model: 'openai/gpt-oss-120b' });
    process.env.AI_PROVIDER = 'not-a-provider';
    expect(await getAiConfig('u1', { allowEnv: true })).toBeNull();
    delete process.env.AI_MODEL;
  });

  it('skips the env key when allowEnv is false', async () => {
    getAiSettings.mockResolvedValue(null);
    process.env.AI_PROVIDER = 'anthropic';
    process.env.AI_API_KEY = 'env-key';
    expect(await getAiConfig('u1', { allowEnv: false })).toBeNull();
  });

  it('uses the env key when there is no user at all', async () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.AI_API_KEY = 'env-key';
    expect(await getAiConfig(null, { allowEnv: true })).toEqual({
      provider: 'gemini',
      apiKey: 'env-key',
      model: null,
    });
    expect(getAiSettings).not.toHaveBeenCalled();
  });
});

describe('resolveHasAiKey', () => {
  it('true when a config resolves', async () => {
    expect(await resolveHasAiKey(Promise.resolve(stored))).toBe(true);
  });

  it('false when the config is null (genuine no-key)', async () => {
    expect(await resolveHasAiKey(Promise.resolve(null))).toBe(false);
  });

  it('true (optimistic) when the config check throws — never a false SSR "add your key"', async () => {
    expect(await resolveHasAiKey(Promise.reject(new Error('db down')))).toBe(true);
  });
});

describe('getUserAiConfig', () => {
  it('does not fall back to the deployment env key in hosted mode', async () => {
    isHosted.mockReturnValue(true);
    getAiSettings.mockResolvedValue(null);
    process.env.AI_PROVIDER = 'anthropic';
    process.env.AI_API_KEY = 'env-key';
    expect(await getUserAiConfig('u1')).toBeNull();
  });

  it('allows the deployment env key in self-host mode', async () => {
    isHosted.mockReturnValue(false);
    getAiSettings.mockResolvedValue(null);
    process.env.AI_PROVIDER = 'anthropic';
    process.env.AI_API_KEY = 'env-key';
    expect(await getUserAiConfig('u1')).toEqual({
      provider: 'anthropic',
      apiKey: 'env-key',
      model: null,
    });
  });
});
