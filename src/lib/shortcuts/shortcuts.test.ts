import { describe, expect, it } from 'vitest';
import {
  CHORD_TIMEOUT_MS,
  IDLE_STATE,
  detectMac,
  isEditableTarget,
  resolveKey,
  shortcutHintFor,
  type KeyInput,
} from './shortcuts';

const key = (k: string, over: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  editable: false,
  dialogOpen: false,
  helpOpen: false,
  isMac: false,
  ...over,
});

describe('resolveKey — global search', () => {
  it('Ctrl+K focuses search on non-Mac', () => {
    expect(resolveKey(IDLE_STATE, key('k', { ctrlKey: true }), 0).action).toEqual({ type: 'focus-search' });
  });

  it('Cmd+K focuses search on Mac, and Ctrl+K does not', () => {
    expect(resolveKey(IDLE_STATE, key('k', { metaKey: true, isMac: true }), 0).action.type).toBe('focus-search');
    expect(resolveKey(IDLE_STATE, key('k', { ctrlKey: true, isMac: true }), 0).action.type).toBe('none');
  });

  it('works while typing in another field', () => {
    expect(resolveKey(IDLE_STATE, key('K', { ctrlKey: true, editable: true }), 0).action.type).toBe('focus-search');
  });

  it('does nothing while a dialog is open', () => {
    expect(resolveKey(IDLE_STATE, key('k', { ctrlKey: true, dialogOpen: true }), 0).action.type).toBe('none');
  });
});

describe('resolveKey — go-to chords', () => {
  const chord = (second: string, gap = 100, over: Partial<KeyInput> = {}) => {
    const armed = resolveKey(IDLE_STATE, key('g'), 1000);
    return resolveKey(armed.state, key(second, over), 1000 + gap).action;
  };

  it('G alone only arms the chord', () => {
    const r = resolveKey(IDLE_STATE, key('g'), 1000);
    expect(r.action.type).toBe('none');
    expect(r.state.armedAt).toBe(1000);
  });

  it.each([
    ['d', '/dashboard'],
    ['p', '/portfolio'],
    ['m', '/markets'],
    ['c', '/mitra'],
    ['s', '/settings'],
  ])('G then %s navigates to %s', (second, href) => {
    expect(chord(second)).toEqual({ type: 'navigate', href });
  });

  it('is case-insensitive (caps lock)', () => {
    expect(chord('P')).toEqual({ type: 'navigate', href: '/portfolio' });
  });

  it('expires after the timeout', () => {
    expect(chord('d', CHORD_TIMEOUT_MS + 1).type).toBe('none');
    expect(chord('d', CHORD_TIMEOUT_MS).type).toBe('navigate');
  });

  it('disarms after any other key', () => {
    const armed = resolveKey(IDLE_STATE, key('g'), 0);
    const other = resolveKey(armed.state, key('x'), 10);
    expect(other.state).toEqual(IDLE_STATE);
    expect(resolveKey(other.state, key('d'), 20).action.type).toBe('none');
  });

  it('a bare D without G does nothing', () => {
    expect(resolveKey(IDLE_STATE, key('d'), 0).action.type).toBe('none');
  });

  it('G G re-arms rather than navigating', () => {
    const first = resolveKey(IDLE_STATE, key('g'), 0);
    const second = resolveKey(first.state, key('g'), 50);
    expect(second.action.type).toBe('none');
    expect(second.state.armedAt).toBe(50);
  });

  it('ignores keys while typing, with modifiers, or with a dialog open', () => {
    expect(chord('d', 100, { editable: true }).type).toBe('none');
    expect(chord('d', 100, { ctrlKey: true }).type).toBe('none');
    expect(chord('d', 100, { altKey: true }).type).toBe('none');
    expect(chord('d', 100, { dialogOpen: true }).type).toBe('none');
    expect(resolveKey(IDLE_STATE, key('g', { editable: true }), 0).state).toEqual(IDLE_STATE);
  });
});

describe('resolveKey — help', () => {
  it('? toggles help', () => {
    expect(resolveKey(IDLE_STATE, key('?'), 0).action).toEqual({ type: 'toggle-help' });
  });

  it('? is ignored while typing', () => {
    expect(resolveKey(IDLE_STATE, key('?', { editable: true }), 0).action.type).toBe('none');
  });

  it('? closes the help dialog but does not open over another dialog', () => {
    expect(resolveKey(IDLE_STATE, key('?', { dialogOpen: true, helpOpen: true }), 0).action.type).toBe('toggle-help');
    expect(resolveKey(IDLE_STATE, key('?', { dialogOpen: true }), 0).action.type).toBe('none');
  });
});

describe('isEditableTarget', () => {
  it('detects text-entry elements', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'textarea' })).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('treats everything else, and a missing target, as not editable', () => {
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('shortcutHintFor', () => {
  it('gives the chord text for routes that have one', () => {
    expect(shortcutHintFor('/portfolio')).toBe('G then P');
    expect(shortcutHintFor('/dashboard')).toBe('G then D');
  });

  it('is undefined for routes without a shortcut', () => {
    expect(shortcutHintFor('/news')).toBeUndefined();
  });
});

describe('detectMac', () => {
  it('recognises Apple platforms', () => {
    expect(detectMac({ platform: 'MacIntel' })).toBe(true);
    expect(detectMac({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })).toBe(true);
  });

  it('defaults to false', () => {
    expect(detectMac({ platform: 'Win32' })).toBe(false);
    expect(detectMac({})).toBe(false);
  });
});
