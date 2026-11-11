import { describe, expect, it } from 'vitest';
import { ALL_ALERT_TYPES, STOCK_ALERT_TYPES } from './stockAlertTypes';

describe('STOCK_ALERT_TYPES', () => {
  it('is every alert type except the portfolio-wide one', () => {
    expect(STOCK_ALERT_TYPES).not.toContain('portfolio_pnl');
    expect(STOCK_ALERT_TYPES).toHaveLength(ALL_ALERT_TYPES.length - 1);
    for (const t of STOCK_ALERT_TYPES) expect(ALL_ALERT_TYPES).toContain(t);
  });
  it('keeps price threshold first, the default for a new alert', () => {
    expect(STOCK_ALERT_TYPES[0]).toBe('price_threshold');
  });
});
