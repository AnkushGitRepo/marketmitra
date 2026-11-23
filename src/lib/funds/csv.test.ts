import { describe, expect, it } from 'vitest';
import { FUND_CSV_COLUMNS, fundsToCsv } from './csv';
import type { FundSummary } from './types';

const fund = (patch: Partial<FundSummary> = {}): FundSummary => ({
  scheme_code: 120503, name: 'Axis Bluechip Fund - Direct Plan - Growth', base_name: 'Axis Bluechip Fund', fund_house: 'Axis Mutual Fund',
  category: 'Equity', sub_category: 'Large Cap', plan: 'direct', option: 'growth', nav: 58.1234, nav_date: '2026-11-20',
  ret_1m: 1.2, ret_3m: 3.4, ret_6m: 5.6, ret_1y: 12.5, ret_3y: 14.1, ret_5y: 15.2, ret_10y: null,
  std_dev_3y: 11.3, sharpe_3y: 0.82, sortino_3y: 1.1, max_drawdown_3y: -18.4, sip_xirr_3y: 13.9, sip_xirr_5y: null,
  expense_ratio: null, aum_cr: 31250.5, ...patch,
});

const lines = (csv: string) => csv.split('\r\n').filter(Boolean);

describe('fundsToCsv', () => {
  it('writes a header row and one CRLF row per fund', () => {
    const out = lines(fundsToCsv([fund(), fund({ scheme_code: 2 })]));
    expect(out).toHaveLength(3);
    expect(out[0].split(',')).toHaveLength(FUND_CSV_COLUMNS.length);
    expect(fundsToCsv([])).toBe(`${out[0]}\r\n`);
  });

  it('puts the fund identity and raw figures in the right columns', () => {
    const [header, row] = lines(fundsToCsv([fund()]));
    const cols = header.split(',');
    const cells = row.split(',');
    const at = (name: string) => cells[cols.indexOf(name)];
    expect(at('Scheme code')).toBe('120503');
    expect(at('Fund')).toBe('Axis Bluechip Fund - Direct Plan - Growth');
    expect(at('NAV (INR)')).toBe('58.1234');
    expect(at('1Y return (%)')).toBe('12.5');
    expect(at('Worst 3Y fall (%)')).toBe('-18.4');
    expect(at('AUM (INR Cr)')).toBe('31250.5');
  });

  it('leaves an unavailable figure blank, never zero', () => {
    const [header, row] = lines(fundsToCsv([fund()]));
    const cols = header.split(',');
    const cells = row.split(',');
    expect(cells[cols.indexOf('10Y return (%)')]).toBe('');
    expect(cells[cols.indexOf('Expense ratio (%)')]).toBe('');
    expect(cells[cols.indexOf('SIP XIRR 5Y (%)')]).toBe('');
  });

  it('quotes commas and defuses spreadsheet formulas in text cells', () => {
    const out = fundsToCsv([fund({ name: '=HYPERLINK("http://x")', fund_house: 'Acme, Ltd', sub_category: null })]);
    expect(out).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(out).toContain('"Acme, Ltd"');
  });
});
