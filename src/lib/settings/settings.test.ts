import { describe, expect, it } from 'vitest';
import { isPhraseConfirmed } from './confirm';
import { DEFAULT_TAB, SETTINGS_TABS, resolveTab, tabAfterKey } from './tabs';

describe('resolveTab', () => {
  it('uses the ?tab= value when it is a real tab', () => {
    expect(resolveTab({ query: 'ai' })).toBe('ai');
    expect(resolveTab({ query: 'data', hash: '#ai' })).toBe('data');
  });

  it('maps every old in-page anchor onto the tab that now holds it', () => {
    expect(resolveTab({ hash: '#notifications' })).toBe('alerts');
    expect(resolveTab({ hash: '#ai' })).toBe('ai');
    expect(resolveTab({ hash: '#chat' })).toBe('preferences');
    expect(resolveTab({ hash: '#display' })).toBe('preferences');
    expect(resolveTab({ hash: '#shortcuts' })).toBe('preferences');
    expect(resolveTab({ hash: '#data' })).toBe('data');
    expect(resolveTab({ hash: '#account' })).toBe('account');
    expect(resolveTab({ hash: '#about' })).toBe('account');
  });

  it('accepts a hash with or without the #, and a new tab id as a hash', () => {
    expect(resolveTab({ hash: 'notifications' })).toBe('alerts');
    expect(resolveTab({ hash: '#preferences' })).toBe('preferences');
  });

  it('falls back to the default for anything unknown or missing', () => {
    expect(resolveTab({})).toBe(DEFAULT_TAB);
    expect(resolveTab({ query: 'nope', hash: '#also-nope' })).toBe(DEFAULT_TAB);
    expect(resolveTab({ query: null, hash: null })).toBe(DEFAULT_TAB);
    expect(resolveTab({ query: '' })).toBe(DEFAULT_TAB);
  });

  it('has five distinct tabs in the intended order', () => {
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual(['account', 'ai', 'preferences', 'alerts', 'data']);
  });
});

describe('tabAfterKey', () => {
  it('moves right and left, wrapping at the ends', () => {
    expect(tabAfterKey('account', 'ArrowRight')).toBe('ai');
    expect(tabAfterKey('data', 'ArrowRight')).toBe('account');
    expect(tabAfterKey('account', 'ArrowLeft')).toBe('data');
    expect(tabAfterKey('ai', 'ArrowLeft')).toBe('account');
  });
  it('jumps with Home and End, and ignores other keys', () => {
    expect(tabAfterKey('alerts', 'Home')).toBe('account');
    expect(tabAfterKey('alerts', 'End')).toBe('data');
    expect(tabAfterKey('alerts', 'a')).toBeNull();
    expect(tabAfterKey('alerts', 'Enter')).toBeNull();
  });
});

describe('isPhraseConfirmed', () => {
  it('requires exactly DELETE, ignoring surrounding spaces', () => {
    expect(isPhraseConfirmed('DELETE')).toBe(true);
    expect(isPhraseConfirmed('  DELETE  ')).toBe(true);
  });
  it('rejects a wrong case, a partial or empty entry, and extra words', () => {
    for (const bad of ['delete', 'Delete', 'DELET', 'DELETE ALL', '', ' ', 'DEL ETE']) expect(isPhraseConfirmed(bad)).toBe(false);
  });
  it('can confirm another phrase', () => {
    expect(isPhraseConfirmed('REMOVE', 'REMOVE')).toBe(true);
    expect(isPhraseConfirmed('DELETE', 'REMOVE')).toBe(false);
  });
});
