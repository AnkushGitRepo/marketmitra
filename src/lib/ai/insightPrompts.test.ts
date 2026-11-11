import { describe, expect, it } from 'vitest';
import { buildStockPrompt } from './insightPrompts';

const grounding = [
  { source: 'Reliance lifts capex, 2026-09-02', text: 'Capex guidance raised for FY27.' },
];

const stockInput = {
  symbol: 'RELIANCE',
  company: { name: 'Reliance Industries', sector: 'Energy', industry: 'Refining', about: null },
  ratios: [],
  latestClose: 2500,
  financialsSummary: [],
  shareholdingLatest: [],
  news: [],
};

describe('grounding block in prompt builders', () => {
  it('buildStockPrompt appends retrieved context when present', () => {
    const withG = buildStockPrompt({ ...stockInput, grounding });
    expect(withG).toContain('Retrieved context (indexed news / filings)');
    expect(withG).toContain('- (Reliance lifts capex, 2026-09-02) Capex guidance raised for FY27.');
  });

  it('buildStockPrompt omits the block when there is no grounding', () => {
    expect(buildStockPrompt(stockInput)).not.toContain('Retrieved context');
    expect(buildStockPrompt({ ...stockInput, grounding: [] })).not.toContain('Retrieved context');
  });
});
