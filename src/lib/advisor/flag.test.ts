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

  it('is refused on a hosted deployment even if the flag is set', () => {
    vi.stubEnv('ADVISOR_MODE', 'enabled');
    vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_MODE', 'hosted');
    expect(isAdvisorEnabled()).toBe(false);
  });
});
