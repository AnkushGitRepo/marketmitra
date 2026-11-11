import { describe, expect, it } from 'vitest';
import { NAV_ICONS, SettingsIcon, StatusIcon } from './NavIcons';

describe('NAV_ICONS', () => {
  it('gives Settings its own gear icon, not a shared one', () => {
    expect(NAV_ICONS['/settings']).toBe(SettingsIcon);
    const others = Object.entries(NAV_ICONS).filter(([href]) => href !== '/settings');
    expect(others.some(([, Icon]) => Icon === SettingsIcon)).toBe(false);
  });
  it('does not reuse the Settings icon for Status', () => {
    expect(NAV_ICONS['/status']).toBe(StatusIcon);
    expect(NAV_ICONS['/status']).not.toBe(NAV_ICONS['/settings']);
  });
  it('uses a distinct icon for every route', () => {
    const icons = Object.values(NAV_ICONS);
    expect(new Set(icons).size).toBe(icons.length);
  });
});
