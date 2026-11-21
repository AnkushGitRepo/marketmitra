import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const getCachedInsight = vi.fn(async (_scope: string, key: string, userId: string | null) => {
  const content = store.get(`${userId}|${key}`);
  return content ? { content, model: 'm', generatedAt: new Date() } : null;
});
vi.mock('@/lib/insights', () => ({ getCachedInsight: (...a: [string, string, string | null]) => getCachedInsight(...a) }));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: async () => undefined }));

const { getCachedIpoBriefs, ipoBriefCacheKey } = await import('./ipoBriefCache');

beforeEach(() => {
  store.clear();
  getCachedInsight.mockClear();
});

describe('ipoBriefCacheKey', () => {
  it('shares the guarded brief and keeps an unrestricted one per user', () => {
    expect(ipoBriefCacheKey('acme', null)).toEqual({ key: 'acme', userId: null });
    expect(ipoBriefCacheKey('acme', 'u1')).toEqual({ key: 'acme:unrestricted', userId: 'u1' });
  });
});

describe('getCachedIpoBriefs', () => {
  it('returns the stored brief per slug and leaves out IPOs with none', async () => {
    store.set('null|a', '{"items":[]}');
    expect(await getCachedIpoBriefs(['a', 'b'], null)).toEqual({ a: '{"items":[]}' });
  });
  it('prefers an unrestricted viewer\'s own brief and falls back to the shared one', async () => {
    store.set('null|a', 'shared-a');
    store.set('u1|a:unrestricted', 'own-a');
    store.set('null|b', 'shared-b');
    expect(await getCachedIpoBriefs(['a', 'b'], 'u1')).toEqual({ a: 'own-a', b: 'shared-b' });
  });
  it('never reads another user\'s brief for a guarded viewer', async () => {
    store.set('u1|a:unrestricted', 'own-a');
    expect(await getCachedIpoBriefs(['a'], null)).toEqual({});
  });
  it('returns nothing, not an error, when the cache cannot be read', async () => {
    getCachedInsight.mockRejectedValueOnce(new Error('db down'));
    expect(await getCachedIpoBriefs(['a'], null)).toEqual({});
  });
});
