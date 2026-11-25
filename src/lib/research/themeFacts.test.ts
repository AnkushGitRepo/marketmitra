import { describe, expect, it } from 'vitest';
import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import { buildThemeFactBlocks } from './themeFacts';

const row = (symbol: string, over: Partial<ScreenerResultRow> = {}): ScreenerResultRow =>
  ({
    symbol,
    name: `${symbol} Ltd`,
    sector: 'Telecommunications',
    industry: null,
    market_cap: 950000,
    current_price: 1700,
    pe: 40.1,
    pb: null,
    book_value: null,
    dividend_yield: null,
    roce: 20.3,
    roe: null,
    face_value: null,
    debt_to_equity: null,
    sales_growth_3y_cagr: 11.2,
    profit_growth_3y_cagr: null,
    fetch_status: 'ok',
    source_tier: 'tier3',
    fetched_at: '2026-11-25',
    ...over,
  }) as ScreenerResultRow;

describe('buildThemeFactBlocks', () => {
  it('lists the leading companies with their figures, dashes for gaps', () => {
    const blocks = buildThemeFactBlocks('Indian Telecom', ['Telecommunications'], [row('BHARTIARTL')], 12);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].heading).toContain('Telecommunications');
    expect(blocks[0].heading).toContain('12 companies');
    expect(blocks[0].body).toContain('BHARTIARTL Ltd (BHARTIARTL): market cap ₹950000 Cr');
    expect(blocks[0].body).toContain('P/E 40.1');
    expect(blocks[0].body).toContain('ROE —');
  });
  it('says plainly when no sector matched', () => {
    const blocks = buildThemeFactBlocks('quantum computing', [], [], 0);
    expect(blocks[0].body).toMatch(/No listed sector matched/);
  });
});
