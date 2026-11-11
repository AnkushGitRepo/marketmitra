import { describe, expect, it } from 'vitest';
import { authorizeCron, isLocalHost } from './cronAuth';

const req = (headers: Record<string, string> = {}) => new Request('http://x/api/cron/x', { method: 'POST', headers });
const base = { secret: 'topsecret', nodeEnv: 'production', hosted: true };

describe('isLocalHost', () => {
  it('accepts only loopback hosts, with or without a port', () => {
    for (const h of ['localhost', 'localhost:3000', '127.0.0.1:3000', '[::1]:3000']) expect(isLocalHost(h), h).toBe(true);
    for (const h of ['example.com', 'localhost.evil.com', '127.0.0.1.evil.com', '10.0.0.5:3000', '', null]) expect(isLocalHost(h), String(h)).toBe(false);
  });
});

describe('authorizeCron', () => {
  it('accepts the right bearer secret and rejects a missing or wrong one', () => {
    expect(authorizeCron(req({ authorization: 'Bearer topsecret' }), base)).toEqual({ ok: true });
    expect(authorizeCron(req(), base)).toMatchObject({ ok: false, status: 401 });
    expect(authorizeCron(req({ authorization: 'Bearer nope' }), base)).toMatchObject({ ok: false, status: 401 });
  });
  it('fails closed when the secret is unset on any hosted or production deployment', () => {
    expect(authorizeCron(req(), { ...base, secret: undefined })).toMatchObject({ ok: false, status: 503 });
    expect(authorizeCron(req({ host: 'localhost:3000' }), { secret: undefined, nodeEnv: 'development', hosted: true })).toMatchObject({ ok: false, status: 503 });
    expect(authorizeCron(req({ host: 'localhost:3000' }), { secret: undefined, nodeEnv: 'production', hosted: false })).toMatchObject({ ok: false, status: 503 });
  });
  it('is open without a secret only for a non-hosted development instance reached on localhost', () => {
    expect(authorizeCron(req({ host: 'localhost:3000' }), { secret: undefined, nodeEnv: 'development', hosted: false })).toEqual({ ok: true });
    expect(authorizeCron(req({ host: 'preview-abc.vercel.app' }), { secret: undefined, nodeEnv: 'development', hosted: false })).toMatchObject({ ok: false, status: 503 });
  });
});
