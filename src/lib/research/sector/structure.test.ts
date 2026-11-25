import { describe, expect, it } from 'vitest';
import type { CardGridBlock, DataTableBlock, ThesisBentoBlock } from '../blocks';
import { buildStructureTask, checklistCards, parseStructure, structureBlocks } from './structure';
import type { SectorInputs } from './inputs';

const inputs = { label: 'Telecom' } as SectorInputs;

describe('parseStructure', () => {
  it('reads the JSON, also from a fenced reply', () => {
    const got = parseStructure('```json\n{"catalysts":["5G rollout"]}\n```');
    expect(got?.catalysts).toEqual(['5G rollout']);
    expect(got?.value_chain).toEqual([]);
  });
  it('is null for a reply that is not JSON', () => {
    expect(parseStructure('Sorry, I cannot.')).toBeNull();
  });
});

describe('structureBlocks', () => {
  it('draws the value chain as a four-column strip with margin and moat tags, leaving out "not stated"', () => {
    const blocks = structureBlocks({
      value_chain: [
        { layer: 'Equipment', role: 'Makes radios.', margin: 'Medium', moat: 'Not stated', leaders: 'STLTECH' },
        { layer: 'Towers', role: 'Leases sites.', margin: 'High', moat: 'High', leaders: '' },
      ],
      catalysts: [], policy_watch: [], red_flags: [], global_comparison: [],
    });
    const grid = blocks.sx_overview?.[0] as CardGridBlock;
    expect(grid.columns).toBe(4);
    expect(grid.cards[0]).toMatchObject({ heading: 'Equipment', tag: 'Margin: Medium', text: 'Makes radios. Listed: STLTECH.' });
    expect(grid.cards[1].tag).toBe('Margin: High · Moat: High');
  });
  it('needs two stages for a strip', () => {
    expect(structureBlocks({ value_chain: [{ layer: 'Only', role: '', margin: '', moat: '', leaders: '' }], catalysts: [], policy_watch: [], red_flags: [], global_comparison: [] }).sx_overview).toBeUndefined();
  });
  it('writes "not found" for a missing comparison cell, never a guess', () => {
    const t = structureBlocks({ value_chain: [], catalysts: [], policy_watch: [], red_flags: [], global_comparison: [
      { company: 'Jio', scale: '480m subscribers', unit_economics: '', valuation: 'N/A', rd: 'Not stated' },
      { company: 'Verizon', scale: '', unit_economics: '$168 ARPA', valuation: '', rd: '' },
    ] }).sx_global?.[0] as DataTableBlock;
    expect(t.rows[0]).toMatchObject({ company: 'Jio', scale: '480m subscribers', unit: 'not found', valuation: 'not found', rd: 'not found' });
  });
  it('makes a green, amber and red callout for the outlook, policy and risk chapters', () => {
    const b = structureBlocks({ value_chain: [], global_comparison: [], catalysts: ['5G'], policy_watch: ['Satcom rules'], red_flags: ['AGR dues'] });
    const tone = (id: 'sx_outlook' | 'sx_policy' | 'sx_risks') => (b[id]?.[0] as ThesisBentoBlock).columns[0].tone;
    expect([tone('sx_outlook'), tone('sx_policy'), tone('sx_risks')]).toEqual(['positive', 'watch', 'risk']);
  });
  it('strips LaTeX from the points and skips an empty list', () => {
    const b = structureBlocks({ value_chain: [], global_comparison: [], catalysts: ['Trades at $17.7\\times P/E$'], policy_watch: [], red_flags: [] });
    expect((b.sx_outlook?.[0] as ThesisBentoBlock).columns[0].items).toEqual(['Trades at 17.7x P/E']);
    expect(b.sx_policy).toBeUndefined();
  });
});

describe('checklistCards', () => {
  const list = Array.from({ length: 10 }, (_, i) => `${i + 1}. **Question ${i + 1}?** - What to look for ${i + 1}.`).join('\n');
  it('turns ten numbered lines into ten cards with a question and guidance', () => {
    const grid = checklistCards(list) as CardGridBlock;
    expect(grid.cards).toHaveLength(10);
    expect(grid.numbered).toBe(true);
    expect(grid.cards[2]).toEqual({ heading: 'Question 3?', text: 'What to look for 3.' });
  });
  it('splits an unbolded question at its question mark', () => {
    const grid = checklistCards(Array.from({ length: 5 }, (_, i) => `${i + 1}. Is Q${i}? Because of ${i}.`).join('\n')) as CardGridBlock;
    expect(grid.cards[0]).toEqual({ heading: 'Is Q0?', text: 'Because of 0.' });
  });
  it('is null when there are too few items to be a checklist', () => {
    expect(checklistCards('1. **A?** b\n2. **C?** d')).toBeNull();
    expect(checklistCards('Just prose.')).toBeNull();
  });
});

describe('buildStructureTask', () => {
  it('does not search and carries only the chapters written', () => {
    const t = buildStructureTask(inputs, { sx_overview: 'Overview text.', sx_risks: 'Risk text.' });
    expect(t.search).toBeNull();
    expect(t.prompt).toContain('Overview text.');
    expect(t.prompt).not.toContain('sx_global');
  });
});
