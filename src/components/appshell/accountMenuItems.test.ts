import { describe, expect, it } from 'vitest';
import { ACCOUNT_MENU_ITEMS, SETTINGS_ITEM, WORKFLOW_ITEMS } from './accountMenuItems';

describe('account menu', () => {
  it('lists cash, tax, then settings, each with a distinct local path', () => {
    expect(ACCOUNT_MENU_ITEMS.map((i) => i.href)).toEqual(['/portfolio/cash', '/portfolio/tax', '/settings']);
    expect(new Set(ACCOUNT_MENU_ITEMS.map((i) => i.href)).size).toBe(ACCOUNT_MENU_ITEMS.length);
    expect(ACCOUNT_MENU_ITEMS.every((i) => i.href.startsWith('/') && i.label && i.hint)).toBe(true);
  });
  it('keeps settings out of the workflow group above the divider', () => {
    expect(WORKFLOW_ITEMS).not.toContain(SETTINGS_ITEM);
  });
});
