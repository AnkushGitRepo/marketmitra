import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVE_TOKENS,
  checkPatRequest,
  createTokenSchema,
  expiryFor,
  generateToken,
  hashToken,
  isPatBlockedPath,
  isUsable,
  parseBearer,
  scopeAllows,
  scopeOf,
} from './pat';

const bytes = (n: number) => Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + n) % 256);

describe('generateToken', () => {
  it('encodes the scope in a readable prefix and is url-safe', () => {
    const r = generateToken('read', bytes(1));
    const w = generateToken('write', bytes(1));
    expect(r.startsWith('mm_pat_r_')).toBe(true);
    expect(w.startsWith('mm_pat_w_')).toBe(true);
    expect(r).toMatch(/^mm_pat_[rw]_[A-Za-z0-9_-]{43}$/);
  });
  it('differs by randomness and rejects short entropy', () => {
    expect(generateToken('read', bytes(1))).not.toBe(generateToken('read', bytes(2)));
    expect(() => generateToken('read', new Uint8Array(8))).toThrow();
  });
});

describe('hashToken / scopeOf', () => {
  it('is a stable 64-char hex sha256 and never contains the token', () => {
    const t = generateToken('read', bytes(3));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t.slice(9, 20));
  });
  it('reads scope from the prefix, and flipping it changes the hash (so it cannot be forged)', () => {
    const t = generateToken('read', bytes(4));
    expect(scopeOf(t)).toBe('read');
    const forged = t.replace('mm_pat_r_', 'mm_pat_w_');
    expect(scopeOf(forged)).toBe('write');
    expect(hashToken(forged)).not.toBe(hashToken(t));
    expect(scopeOf('Bearer nope')).toBeNull();
  });
});

describe('parseBearer', () => {
  const t = generateToken('write', bytes(5));
  it('extracts a PAT from a Bearer header, case-insensitively', () => {
    expect(parseBearer(`Bearer ${t}`)).toBe(t);
    expect(parseBearer(`bearer ${t}`)).toBe(t);
  });
  it('ignores missing, non-bearer and non-PAT credentials', () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer(`Basic ${t}`)).toBeNull();
    expect(parseBearer('Bearer eyJhbGciOi.clerk.jwt')).toBeNull();
    expect(parseBearer(`Bearer ${t} extra`)).toBeNull();
  });
});

describe('scopeAllows', () => {
  it('read allows only safe methods; write allows everything', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) expect(scopeAllows('read', m)).toBe(true);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(scopeAllows('read', m)).toBe(false);
    for (const m of ['GET', 'POST', 'DELETE']) expect(scopeAllows('write', m)).toBe(true);
  });
});

describe('isPatBlockedPath', () => {
  it('blocks token management, settings/keys, cron, advisor and system logs', () => {
    for (const p of ['/api/settings', '/api/settings/tokens', '/api/settings/ai', '/api/settings/export', '/api/cron/evaluate-alerts', '/api/advisor/plan', '/api/system/logs'])
      expect(isPatBlockedPath(p), p).toBe(true);
  });
  it('allows the data API and does not match on string prefixes alone', () => {
    for (const p of ['/api/watchlists', '/api/holdings', '/api/stock/TCS', '/api/alerts/abc', '/api/settingsx', '/api/system/status'])
      expect(isPatBlockedPath(p), p).toBe(false);
  });
});

describe('path normalisation (cannot be used to dodge the blocklist)', () => {
  it('blocks case, double-slash, trailing-slash and percent-encoded variants', () => {
    for (const p of ['/API/settings', '/api//settings/tokens', '/api/settings/', '/api/%73ettings/tokens', '/api/%63ron/x', '/api/Settings', '/api/settings%2Ftokens'])
      expect(isPatBlockedPath(p), p).toBe(true);
  });
  it('treats an undecodable or double-encoded path as blocked', () => {
    expect(isPatBlockedPath('/api/%E0%A4%A')).toBe(true);
    expect(isPatBlockedPath('/api/%2573ettings')).toBe(true);
  });
});

describe('expiryFor / isUsable', () => {
  const now = new Date('2026-11-11T00:00:00.000Z');
  it('maps choices to dates, never to null for a finite choice', () => {
    expect(expiryFor('never', now)).toBeNull();
    expect(expiryFor('30d', now)?.toISOString()).toBe('2026-12-11T00:00:00.000Z');
    expect(expiryFor('90d', now)?.toISOString()).toBe('2027-02-09T00:00:00.000Z');
    expect(expiryFor('365d', now)?.toISOString()).toBe('2027-11-11T00:00:00.000Z');
  });
  it('rejects revoked and expired tokens, accepts the rest', () => {
    expect(isUsable({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(isUsable({ revokedAt: null, expiresAt: new Date('2026-11-12') }, now)).toBe(true);
    expect(isUsable({ revokedAt: null, expiresAt: new Date('2026-11-10') }, now)).toBe(false);
    expect(isUsable({ revokedAt: new Date('2026-11-01'), expiresAt: null }, now)).toBe(false);
  });
});

describe('createTokenSchema', () => {
  it('accepts a named token and defaults', () => {
    expect(createTokenSchema.parse({ name: ' cron ', scope: 'read' })).toEqual({ name: 'cron', scope: 'read', expiry: '90d' });
  });
  it('rejects empty names, unknown scopes and unknown expiry', () => {
    expect(createTokenSchema.safeParse({ name: '', scope: 'read' }).success).toBe(false);
    expect(createTokenSchema.safeParse({ name: 'x', scope: 'admin' }).success).toBe(false);
    expect(createTokenSchema.safeParse({ name: 'x', scope: 'read', expiry: '1d' }).success).toBe(false);
  });
  it('caps active tokens at 10', () => expect(MAX_ACTIVE_TOKENS).toBe(10));
});

describe('checkPatRequest (proxy pre-check, no database)', () => {
  const read = generateToken('read', bytes(6));
  const write = generateToken('write', bytes(7));
  const req = (method: string, path: string, authorization: string | null) => ({ method, path, authorization });

  it('passes through requests with no PAT', () => {
    expect(checkPatRequest(req('GET', '/api/holdings', null)).kind).toBe('none');
    expect(checkPatRequest(req('GET', '/api/holdings', 'Bearer other.jwt')).kind).toBe('none');
  });
  it('allows a read token on GET and keys rate limiting by token hash, not by the token', () => {
    const d = checkPatRequest(req('GET', '/api/holdings', `Bearer ${read}`));
    expect(d.kind).toBe('allow');
    if (d.kind === 'allow') {
      expect(d.rateKey).toMatch(/^pat:[0-9a-f]{16}$/);
      expect(d.rateKey).not.toContain(read.slice(9, 20));
    }
  });
  it('denies a read token on writes with 403', () => {
    const d = checkPatRequest(req('POST', '/api/watchlists', `Bearer ${read}`));
    expect(d).toMatchObject({ kind: 'deny', status: 403 });
  });
  it('lets a write token write', () => {
    expect(checkPatRequest(req('POST', '/api/watchlists', `Bearer ${write}`)).kind).toBe('allow');
  });
  it('denies an encoded blocked path through the full gate', () => {
    expect(checkPatRequest(req('GET', '/api/%73ettings/tokens', `Bearer ${write}`))).toMatchObject({ kind: 'deny', status: 403 });
    // Routing is case-sensitive, so a differently-cased prefix is not an API path and is refused.
    expect(checkPatRequest(req('GET', '/API/holdings', `Bearer ${read}`)).kind).toBe('deny');
  });
  it('denies tokens on non-API paths such as pages', () => {
    expect(checkPatRequest(req('GET', '/settings', `Bearer ${read}`))).toMatchObject({ kind: 'deny', status: 403 });
    expect(checkPatRequest(req('GET', '/api', `Bearer ${read}`))).toMatchObject({ kind: 'deny', status: 403 });
  });
  it('denies blocked paths for any token, including token management', () => {
    expect(checkPatRequest(req('GET', '/api/settings/tokens', `Bearer ${write}`))).toMatchObject({ kind: 'deny', status: 403 });
    expect(checkPatRequest(req('GET', '/api/cron/evaluate-alerts', `Bearer ${read}`))).toMatchObject({ kind: 'deny', status: 403 });
  });
});
