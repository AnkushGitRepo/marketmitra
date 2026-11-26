import { describe, expect, it } from 'vitest';
import { trio } from './fixtures';
import { buildStructureTask, parseStructure, structureBlocks } from './structure';

const reply = JSON.stringify({
  sector_kpis: [
    { measure: 'ARPU', unit: 'Rs per month', values: [{ symbol: 'JPL', value: 'Rs 215.6' }, { symbol: 'BHARTIARTL', value: 'Rs 264 (Q2 FY27)' }, { symbol: 'IDEA', value: 'not found' }], leader: 'BHARTIARTL' },
    { measure: '5G users', unit: '', values: [{ symbol: 'JPL', value: '285 million' }, { symbol: 'NOPE', value: '1' }], leader: 'JPL' },
  ],
  profiles: [
    { symbol: 'IDEA', business: 'A 4G operator.', mix: 'India mobile', moat: 'not stated', edge: 'High tariff beta', lags: 'Debt' },
    { symbol: 'JPL', business: 'All-IP 5G and digital.', mix: 'Mobility, fibre', moat: 'Lowest cost per GB', edge: 'Scale', lags: 'ARPU' },
    { symbol: 'GHOST', business: 'Not in the comparison.', mix: '', moat: '', edge: '', lags: '' },
  ],
  issues: [
    { symbol: 'IDEA', severity: 'moderate', issue: 'AGR dues remain large.' },
    { symbol: 'IDEA', severity: 'CRITICAL', issue: 'Negative net worth of Rs 80,000 crore.' },
    { symbol: 'JPL', severity: 'weird', issue: 'Spectrum payments are deferred.' },
    { symbol: 'GHOST', severity: 'CRITICAL', issue: 'Should be dropped.' },
  ],
});

describe('structure', () => {
  const blocks = structureBlocks(parseStructure(reply)!, trio());

  it('builds the sector measures as a table with the company columns, "not found" for a gap and the leader marked', () => {
    const t = blocks.cmp_matrix![0] as Extract<NonNullable<typeof blocks.cmp_matrix>[number], { type: 'data_table' }>;
    expect(t.columns.map((c) => c.key)).toEqual(['measure', 'JPL', 'BHARTIARTL', 'IDEA']);
    expect(t.rows[0]).toMatchObject({ measure: 'ARPU (Rs per month)', IDEA: 'not found' });
    expect(t.rows[1]).toMatchObject({ BHARTIARTL: 'not found', IDEA: 'not found', JPL: '285 million' });
    expect(t.highlights).toEqual([{ row: 0, column: 'BHARTIARTL' }, { row: 1, column: 'JPL' }]);
  });

  it('drops a company that is not in the comparison, and orders profiles as the companies were given', () => {
    const cards = (blocks.cmp_profiles![0] as Extract<NonNullable<typeof blocks.cmp_profiles>[number], { type: 'card_grid' }>).cards;
    expect(cards.map((c) => c.heading)).toEqual(['Jio Platforms', 'Vodafone Idea']);
    expect(cards[1].text).not.toContain('Moat'); // "not stated" is left out, not printed
    expect(cards[0].tag).toBe('Edge: Scale');
  });

  it('tags each issue, worst first within a company, and treats an unknown severity as a watch-item', () => {
    const cards = (blocks.cmp_issues![0] as Extract<NonNullable<typeof blocks.cmp_issues>[number], { type: 'card_grid' }>).cards;
    expect(cards.map((c) => `${c.heading}:${c.tag}`)).toEqual(['Jio Platforms:NORMAL', 'Vodafone Idea:CRITICAL', 'Vodafone Idea:MODERATE']);
    expect(cards.some((c) => c.text.includes('dropped'))).toBe(false);
  });

  it('shows nothing when the reply is empty or broken', () => {
    expect(parseStructure('not json')).toBeNull();
    expect(structureBlocks(parseStructure('{}')!, trio())).toEqual({});
  });

  it('asks for the companies by exact symbol and sends only the chapters', () => {
    const task = buildStructureTask(trio(), { cmp_matrix: 'Matrix text.', cmp_questions: 'ignored' });
    expect(task.search).toBeNull();
    expect(task.prompt).toContain('JPL = Jio Platforms');
    expect(task.prompt).toContain('Matrix text.');
    expect(task.prompt).not.toContain('ignored');
  });
});
