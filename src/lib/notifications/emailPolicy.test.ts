import { describe, expect, it } from 'vitest';
import { EMAIL_ATTEMPTS, EMAIL_RETRY_DELAYS_MS, decideEmailRoute, describeEmailSkip, isTransientEmailError } from './emailPolicy';

describe('decideEmailRoute', () => {
  const base = { enabled: true, providerConfigured: true, address: 'me@example.com' };

  it('sends when email alerts are on, a provider is configured and an address is known', () => {
    expect(decideEmailRoute(base)).toEqual({ kind: 'send', to: 'me@example.com' });
  });

  it('skips with the reason, checking the user\'s choice before the server setup', () => {
    expect(decideEmailRoute({ ...base, enabled: false })).toEqual({ kind: 'skip', reason: 'disabled' });
    expect(decideEmailRoute({ ...base, providerConfigured: false })).toEqual({ kind: 'skip', reason: 'provider_missing' });
    expect(decideEmailRoute({ ...base, address: null })).toEqual({ kind: 'skip', reason: 'no_address' });
    expect(decideEmailRoute({ ...base, address: '   ' })).toEqual({ kind: 'skip', reason: 'no_address' });
    expect(decideEmailRoute({ enabled: false, providerConfigured: false, address: null })).toEqual({ kind: 'skip', reason: 'disabled' });
  });

  it('trims the address', () => {
    expect(decideEmailRoute({ ...base, address: '  me@example.com ' })).toEqual({ kind: 'send', to: 'me@example.com' });
  });

  it('explains every skip reason in plain words', () => {
    for (const reason of ['disabled', 'provider_missing', 'no_address'] as const) expect(describeEmailSkip(reason).length).toBeGreaterThan(20);
    expect(describeEmailSkip('disabled')).toMatch(/off/i);
    expect(describeEmailSkip('provider_missing')).toMatch(/server/i);
    expect(describeEmailSkip('no_address')).toMatch(/address/i);
  });

  it('tells a hosted user to verify an address and a self-hoster to set ALERT_EMAIL_TO', () => {
    expect(describeEmailSkip('no_address', true)).toMatch(/account settings/i);
    expect(describeEmailSkip('no_address', false)).toContain('ALERT_EMAIL_TO');
    expect(describeEmailSkip('disabled', false)).toBe(describeEmailSkip('disabled', true));
  });
});

describe('isTransientEmailError', () => {
  it.each([
    [{ statusCode: 429 }, true],
    [{ statusCode: 500 }, true],
    [{ statusCode: 503 }, true],
    [{ name: 'rate_limit_exceeded' }, true],
    [{ name: 'application_error' }, true],
    [{ name: 'internal_server_error' }, true],
    [{ message: 'fetch failed' }, true],
    [{ message: 'ETIMEDOUT' }, true],
    [{ statusCode: 403, name: 'validation_error' }, false],
    [{ statusCode: 422, name: 'invalid_from_address' }, false],
    [{ name: 'missing_api_key' }, false],
    [{ statusCode: 400 }, false],
    [{ message: 'The domain is not verified' }, false],
  ])('%j -> %s', (error, transient) => {
    expect(isTransientEmailError(error)).toBe(transient);
  });
});

describe('retry settings', () => {
  it('tries a few times with a short back-off that fits inside a cron run', () => {
    expect(EMAIL_ATTEMPTS).toBeGreaterThanOrEqual(2);
    expect(EMAIL_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)).toBeLessThan(5000);
  });
});
