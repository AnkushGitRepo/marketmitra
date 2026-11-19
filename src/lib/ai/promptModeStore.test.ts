import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { hosted: false, unrestricted: true, fail: false };
const getPreferences = vi.fn(async () => {
  if (state.fail) throw new Error('db down');
  return { chat: { unrestricted: state.unrestricted } };
});
vi.mock('@/lib/deployment-mode', () => ({ isHosted: () => state.hosted }));
vi.mock('@/lib/preferences/store', () => ({ getPreferences }));

const { resolvePromptMode } = await import('./promptModeStore');

beforeEach(() => {
  vi.unstubAllEnvs();
  state.hosted = false;
  state.unrestricted = true;
  state.fail = false;
  vi.clearAllMocks();
});

describe('resolvePromptMode', () => {
  it('is unrestricted for a local user who switched it on', async () => {
    expect(await resolvePromptMode('local')).toBe('unrestricted');
  });
  it('is guarded when the setting is off', async () => {
    state.unrestricted = false;
    expect(await resolvePromptMode('local')).toBe('guarded');
  });
  it('is guarded for an ordinary hosted user and never even reads the stored setting', async () => {
    state.hosted = true;
    vi.stubEnv('ADMIN_USER_IDS', 'admin1');
    expect(await resolvePromptMode('u1')).toBe('guarded');
    expect(getPreferences).not.toHaveBeenCalled();
  });
  it('is guarded on the hosted site when no admin is configured', async () => {
    state.hosted = true;
    vi.stubEnv('ADMIN_USER_IDS', '');
    expect(await resolvePromptMode('admin1')).toBe('guarded');
  });
  it('lets a hosted admin who switched it on use it, and honours their setting being off', async () => {
    state.hosted = true;
    vi.stubEnv('ADMIN_USER_IDS', 'admin1');
    expect(await resolvePromptMode('admin1')).toBe('unrestricted');
    state.unrestricted = false;
    expect(await resolvePromptMode('admin1')).toBe('guarded');
  });
  it('fails closed to guarded if preferences cannot be read', async () => {
    state.fail = true;
    expect(await resolvePromptMode('local')).toBe('guarded');
  });
});
