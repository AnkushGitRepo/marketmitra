import { describe, expect, it } from 'vitest';
import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import { csvCell, toCsv } from './csv';

function row(overrides: Partial<ScreenerResultRow> = {}): ScreenerResultRow {
  return {
    symbol: 'TCS',
    name: 'Tata Consultancy Services Limited',
    sector: 'Information Technology',
    industry: 'IT Services',
    market_cap: 1280000,
    current_price: 3500,
    pe: 28.4,
    book_value: null,
    pb: 13.1,
    dividend_yield: 1.7,
    roce: 60,
    roe: 50,
    face_value: 1,
    debt_to_equity: 0.1,
    sales_growth_3y_cagr: 9,
    profit_growth_3y_cagr: -2.5,
    fetch_status: 'ok',
    source_tier: 'x',
    fetched_at: '2026-11-06T00:00:00Z',
    ...overrides,
  };
}

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('A, B')).toBe('"A, B"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('neutralises spreadsheet formulas in text', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('writes numbers bare, including negatives, and null as empty', () => {
    expect(csvCell(-2.5)).toBe('-2.5');
    expect(csvCell(null)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
  });
});

describe('toCsv', () => {
  it('emits a header plus one CRLF-terminated line per row', () => {
    const lines = toCsv([row(), row({ symbol: 'X', name: '=cmd', sector: null })]).split('\r\n');
    expect(lines[0]).toMatch(/^Symbol,Company,Sector,Industry,Price \(INR\),Market cap \(INR Cr\)/);
    expect(lines[1]).toContain(
      'TCS,Tata Consultancy Services Limited,Information Technology,IT Services,3500,1280000,28.4',
    );
    expect(lines[1]).toContain(',-2.5');
    expect(lines[2]).toContain("X,'=cmd,,");
    expect(lines[3]).toBe('');
  });
});
