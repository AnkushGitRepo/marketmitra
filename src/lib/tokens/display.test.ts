import { describe, expect, it } from 'vitest';
import { expiryLabel, lastUsedLabel, scopeLabel } from './display';

const NOW = new Date('2026-11-11T00:00:00.000Z');

describe('expiryLabel', () => {
  it('says never for no expiry, a date for a future one, and flags expired/revoked', () => {
    expect(expiryLabel({ expiresAt: null, status: 'active' }, NOW)).toBe('Never expires');
    expect(expiryLabel({ expiresAt: new Date('2027-02-09T00:00:00Z'), status: 'active' }, NOW)).toBe('Expires 2027-02-09');
    expect(expiryLabel({ expiresAt: new Date('2026-11-01T00:00:00Z'), status: 'expired' }, NOW)).toBe('Expired 2026-11-01');
    expect(expiryLabel({ expiresAt: null, status: 'revoked' }, NOW)).toBe('Revoked');
  });
  it('warns when a token expires within a week', () => {
    expect(expiryLabel({ expiresAt: new Date('2026-11-14T00:00:00Z'), status: 'active' }, NOW)).toBe('Expires in 3 days (2026-11-14)');
  });
});

describe('lastUsedLabel', () => {
  it('handles never used and a date', () => {
    expect(lastUsedLabel(null)).toBe('Never used');
    expect(lastUsedLabel(new Date('2026-11-10T08:30:00Z'))).toBe('Last used 2026-11-10');
  });
});

describe('scopeLabel', () => {
  it('explains the scopes in plain words', () => {
    expect(scopeLabel('read')).toBe('Read only');
    expect(scopeLabel('write')).toBe('Read & write');
  });
});
