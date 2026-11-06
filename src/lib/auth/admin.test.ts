import { describe, expect, it } from 'vitest';
import { isAdminUser } from './admin';

describe('isAdminUser', () => {
  it('is always true on a self-hosted (single-operator) instance', () => {
    expect(isAdminUser('local', { hosted: false, adminIds: undefined })).toBe(true);
  });
  it('on a hosted instance, only allowlisted user ids are admins', () => {
    const ctx = { hosted: true, adminIds: 'user_abc, user_def' };
    expect(isAdminUser('user_abc', ctx)).toBe(true);
    expect(isAdminUser('user_def', ctx)).toBe(true);
    expect(isAdminUser('user_xyz', ctx)).toBe(false);
  });
  it('is closed by default when no admins are configured', () => {
    expect(isAdminUser('user_abc', { hosted: true, adminIds: undefined })).toBe(false);
    expect(isAdminUser('user_abc', { hosted: true, adminIds: '' })).toBe(false);
    expect(isAdminUser('user_abc', { hosted: true, adminIds: ' , ' })).toBe(false);
  });
  it('requires an exact id match, not a substring', () => {
    expect(isAdminUser('user_ab', { hosted: true, adminIds: 'user_abc' })).toBe(false);
  });
  it('denies a missing user', () => {
    expect(isAdminUser(null, { hosted: true, adminIds: 'user_abc' })).toBe(false);
  });
});
