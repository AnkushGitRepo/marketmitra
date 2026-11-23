import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, applyPatch, preferencesPatchSchema, resolvePreferences } from './schema';

describe('resolvePreferences', () => {
  it('keeps automatic stock analysts on by default, and honours an explicit off', () => {
    expect(resolvePreferences(undefined).agents.auto).toBe(true);
    expect(resolvePreferences({ agents: { auto: false } }).agents.auto).toBe(false);
    expect(resolvePreferences({ agents: { auto: 'no' } }).agents.auto).toBe(true);
  });

  it('keeps unrestricted Mitra off unless explicitly stored as true', () => {
    expect(resolvePreferences(undefined).chat.unrestricted).toBe(false);
    expect(resolvePreferences({ chat: { unrestricted: 'yes' } }).chat.unrestricted).toBe(false);
    expect(resolvePreferences({ chat: { unrestricted: true } }).chat.unrestricted).toBe(true);
  });

  it('gives sensible defaults for nothing stored', () => {
    expect(resolvePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.chat).toEqual({ platformAccess: true, sendOnEnter: true, showToolActivity: true, dictationLanguage: 'auto', unrestricted: false });
    expect(DEFAULT_PREFERENCES.display.hideValuesByDefault).toBe(false);
    expect(DEFAULT_PREFERENCES.shortcuts.enabled).toBe(true);
  });

  it('fills missing fields and keeps stored ones', () => {
    const r = resolvePreferences({ chat: { sendOnEnter: false } });
    expect(r.chat.sendOnEnter).toBe(false);
    expect(r.chat.platformAccess).toBe(true);
  });

  it('keeps good groups when one field is invalid', () => {
    const r = resolvePreferences({ chat: { dictationLanguage: 'klingon' }, display: { hideValuesByDefault: true } });
    expect(r.display.hideValuesByDefault).toBe(true);
    expect(r.chat).toEqual(DEFAULT_PREFERENCES.chat);
  });

  it('ignores non-object junk', () => {
    expect(resolvePreferences('nope')).toEqual(DEFAULT_PREFERENCES);
    expect(resolvePreferences(42)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('preferencesPatchSchema', () => {
  it('accepts a partial patch', () => {
    expect(preferencesPatchSchema.safeParse({ chat: { platformAccess: false } }).success).toBe(true);
    expect(preferencesPatchSchema.safeParse({}).success).toBe(true);
  });

  it('rejects unknown groups, unknown fields and wrong types', () => {
    expect(preferencesPatchSchema.safeParse({ admin: { enabled: true } }).success).toBe(false);
    expect(preferencesPatchSchema.safeParse({ chat: { nope: true } }).success).toBe(false);
    expect(preferencesPatchSchema.safeParse({ chat: { sendOnEnter: 'yes' } }).success).toBe(false);
    expect(preferencesPatchSchema.safeParse({ chat: { dictationLanguage: 'xx' } }).success).toBe(false);
  });
});

describe('applyPatch', () => {
  it('merges per group without mutating the inputs', () => {
    const current = resolvePreferences({});
    const frozen = JSON.stringify(current);
    const next = applyPatch(current, { chat: { sendOnEnter: false }, shortcuts: { enabled: false } });
    expect(next.chat.sendOnEnter).toBe(false);
    expect(next.chat.platformAccess).toBe(true);
    expect(next.shortcuts.enabled).toBe(false);
    expect(JSON.stringify(current)).toBe(frozen);
    expect(next).not.toBe(current);
  });
});

describe('onboarding preferences', () => {
  it('defaults to no chosen profile, not completed, not dismissed', () => {
    expect(resolvePreferences(undefined).onboarding).toEqual({ riskProfile: null, completed: false, dismissed: false });
  });
  it('falls back to no profile for an unknown one and keeps the rest', () => {
    const p = resolvePreferences({ onboarding: { riskProfile: 'yolo', completed: true } });
    expect(p.onboarding).toEqual({ riskProfile: null, completed: true, dismissed: false });
  });
  it('accepts a patch and rejects unknown keys', () => {
    expect(preferencesPatchSchema.safeParse({ onboarding: { dismissed: true } }).success).toBe(true);
    expect(preferencesPatchSchema.safeParse({ onboarding: { nope: 1 } }).success).toBe(false);
    expect(applyPatch(DEFAULT_PREFERENCES, { onboarding: { riskProfile: 'aggressive' } }).onboarding.riskProfile).toBe('aggressive');
  });
});
