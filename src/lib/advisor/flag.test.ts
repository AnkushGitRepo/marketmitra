import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdvisorEnabled } from './flag';

describe('isAdvisorEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is off by default', () => {
    vi.stubEnv('ADVISOR_MODE', '');
    expect(isAdvisorEnabled()).toBe(false);
  });

  it('needs the exact value "enabled"', () => {
    vi.stubEnv('ADVISOR_MODE', 'true');
    expect(isAdvisorEnabled()).toBe(false);
    vi.stubEnv('ADVISOR_MODE', 'enabled');
    expect(isAdvisorEnabled()).toBe(true);
  });

  it('is refused on a hosted deployment for everyone but an admin, even if the flag is set', () => {
    vi.stubEnv('ADVISOR_MODE', 'enabled');
    vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_MODE', 'hosted');
    vi.stubEnv('ADMIN_USER_IDS', 'user_admin');
    expect(isAdvisorEnabled()).toBe(false); // no user (scheduler, signed out)
    expect(isAdvisorEnabled(null)).toBe(false);
    expect(isAdvisorEnabled('user_regular')).toBe(false);
    expect(isAdvisorEnabled('user_admin')).toBe(true);
  });

  it('needs the flag for an admin too', () => {
    vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_MODE', 'hosted');
    vi.stubEnv('ADMIN_USER_IDS', 'user_admin');
    vi.stubEnv('ADVISOR_MODE', '');
    expect(isAdvisorEnabled('user_admin')).toBe(false);
  });

  it('is closed on a hosted deployment with no admin configured', () => {
    vi.stubEnv('ADVISOR_MODE', 'enabled');
    vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_MODE', 'hosted');
    vi.stubEnv('ADMIN_USER_IDS', '');
    expect(isAdvisorEnabled('user_admin')).toBe(false);
  });
});
