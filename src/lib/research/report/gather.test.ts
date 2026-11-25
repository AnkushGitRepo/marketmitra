import { describe, expect, it, vi } from 'vitest';
import { gatherReportInputs, type ReportGetters } from './gather';

const company = { symbol: 'ACME', name: 'Acme', industry: null, sector: null, about: null, source_tier: 't' };
const getters = (over: Partial<ReportGetters> = {}): ReportGetters => ({
  getCompany: vi.fn(async () => company),
  getRatios: vi.fn(async () => []),
  getFinancials: vi.fn(async () => []),
  getShareholding: vi.fn(async () => []),
  getPeers: vi.fn(async () => []),
  getPrices: vi.fn(async () => []),
  getAnnouncements: vi.fn(async () => []),
  getInsights: vi.fn(async () => []),
  ...over,
});

describe('gatherReportInputs', () => {
  it('reads all four statement types and every other part for the symbol', async () => {
    const g = getters();
    const inputs = await gatherReportInputs('ACME', g);
    expect(inputs?.symbol).toBe('ACME');
    expect(vi.mocked(g.getFinancials).mock.calls.map((c) => c[1]).sort()).toEqual(['balance_sheet', 'cash_flow', 'profit_and_loss', 'ratios']);
    expect(vi.mocked(g.getPrices)).toHaveBeenCalledWith('ACME', '5y');
  });

  it('is null for an unknown company, without reading anything else', async () => {
    const g = getters({ getCompany: vi.fn(async () => null) });
    expect(await gatherReportInputs('NOPE', g)).toBeNull();
    expect(g.getRatios).not.toHaveBeenCalled();
  });

  it('treats a read that throws, or returns null, as a part with nothing, and still returns the rest', async () => {
    const g = getters({
      getPeers: vi.fn(async () => { throw new Error('down'); }),
      getAnnouncements: vi.fn(async () => null),
      getRatios: vi.fn(async () => [{ name: 'ROCE', value: '10', unit: '%', as_of: '2026-11-25', source_tier: 't' }]),
    });
    const inputs = await gatherReportInputs('ACME', g);
    expect(inputs?.peers).toBeNull();
    expect(inputs?.announcements).toBeNull();
    expect(inputs?.ratios).toHaveLength(1);
  });
});
