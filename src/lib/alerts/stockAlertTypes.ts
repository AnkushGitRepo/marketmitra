import type { AlertType } from './types';

export const ALL_ALERT_TYPES: readonly AlertType[] = [
  'price_threshold',
  'percent_move',
  'week52_breach',
  'portfolio_pnl',
  'trailing_stop',
  'cumulative_drawdown',
];

/** Alert types that make sense for one stock. `portfolio_pnl` watches the whole portfolio, so it is left out of a stock-page modal. */
export const STOCK_ALERT_TYPES: readonly AlertType[] = ALL_ALERT_TYPES.filter((t) => t !== 'portfolio_pnl');
