import { describe, expect, it } from 'vitest';
import { authorizeCron } from './cronAuth';

const req = (headers: Record<string, string> = {}) => new Request('http://x/api/cron/x', { method: 'POST', headers });

describe('authorizeCron', () => {
  it('accepts the right bearer secret', () => {
    expect(authorizeCron(req({ authorization: 'Bearer topsecret' }), 'topsecret')).toEqual({ ok: true });
  });
  it('rejects a missing, wrong or malformed secret', () => {
    expect(authorizeCron(req(), 'topsecret')).toMatchObject({ ok: false, status: 401 });
    expect(authorizeCron(req({ authorization: 'Bearer nope' }), 'topsecret')).toMatchObject({ ok: false, status: 401 });
    expect(authorizeCron(req({ authorization: 'topsecret' }), 'topsecret')).toMatchObject({ ok: false, status: 401 });
  });
  it('fails closed when no secret is configured, whatever the request claims', () => {
    expect(authorizeCron(req(), undefined)).toMatchObject({ ok: false, status: 503 });
    expect(authorizeCron(req({ host: 'localhost:3000' }), undefined)).toMatchObject({ ok: false, status: 503 });
    expect(authorizeCron(req({ host: '127.0.0.1', authorization: 'Bearer anything' }), '')).toMatchObject({ ok: false, status: 503 });
  });
  it('cannot be bypassed by spoofing the Host header', () => {
    expect(authorizeCron(req({ host: 'localhost' }), 'topsecret')).toMatchObject({ ok: false, status: 401 });
  });
});
