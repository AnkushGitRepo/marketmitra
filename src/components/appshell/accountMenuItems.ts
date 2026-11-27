// The destinations in the profile menu, shared by the self-host pill and the hosted (Clerk) one so they cannot drift.

export interface AccountMenuItem {
  readonly href: string;
  readonly label: string;
  readonly hint: string;
}

/** Items above the divider: the portfolio's secondary workflows. */
export const WORKFLOW_ITEMS: readonly AccountMenuItem[] = [
  { href: '/portfolio/cash', label: 'Cash & Liquid Funds', hint: 'Dry powder and rebalance sandbox' },
  { href: '/portfolio/tax', label: 'Tax & Harvesting', hint: 'STCG, LTCG and loss positions for the financial year' },
];

export const SETTINGS_ITEM: AccountMenuItem = { href: '/settings', label: 'Settings', hint: 'Your AI key, preferences and data' };

export const ACCOUNT_MENU_ITEMS: readonly AccountMenuItem[] = [...WORKFLOW_ITEMS, SETTINGS_ITEM];
