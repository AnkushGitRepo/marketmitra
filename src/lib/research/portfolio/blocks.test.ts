import { describe, expect, it } from 'vitest';
import { blocksToMarkdown } from '../blocksMarkdown';
import { factorBlocks, healthBlocks, losersBlocks, qualityBlocks, riskBlocks, scenarioBlocks } from './blocks';
import { book } from './fixtures';

const kpi = (blocks: ReturnType<typeof healthBlocks>) => blocks.find((b) => b.type === 'kpi_grid') as Extract<(typeof blocks)[number], { type: 'kpi_grid' }>;

describe('portfolio blocks', () => {
  it('shows the health strip and a chart of winners and losers', () => {
    const blocks = healthBlocks(book());
    const items = kpi(blocks).items;
    expect(items.map((i) => i.label)).toEqual(['Health score', 'Gain concentration', 'Critical drawdowns', 'Weighted ROCE · P/E']);
    expect(items[2].value).toBe('3');
    const chart = blocks.find((b) => b.type === 'bar_chart') as Extract<(typeof blocks)[number], { type: 'bar_chart' }>;
    expect(chart.categories[0]).toBe('LAURUSLABS');
    expect(chart.categories.at(-1)).toBe('BANDHANBNK'); // the biggest loss in rupees
  });

  it('tags every holding below cost, worst first, and only those', () => {
    const blocks = losersBlocks(book());
    const cards = (blocks[0] as Extract<(typeof blocks)[number], { type: 'card_grid' }>).cards;
    expect(cards.map((c) => c.tag)).toEqual(['CRITICAL', 'CRITICAL', 'CRITICAL', 'NORMAL']);
    expect(cards[0].heading).toMatch(/^LATENTVIEW: −64/); // a true minus: no doubled dash
    expect(cards.every((c) => !/--| - -/.test(c.heading))).toBe(true);
    expect(cards.some((c) => c.heading.startsWith('PNB'))).toBe(false);
  });

  it('adds the biggest winners with what they trade at', () => {
    const blocks = losersBlocks(book());
    const table = blocks.find((b) => b.type === 'data_table' && b.title === 'Winners carrying the book') as Extract<(typeof blocks)[number], { type: 'data_table' }>;
    expect(table.rows.map((r) => r.name)).toEqual(['LAURUSLABS Ltd', 'PNB Ltd']);
    expect(table.rows[0].pe).toBe(18);
  });

  it('groups the book by economic driver', () => {
    const chart = factorBlocks(book())[0] as Extract<ReturnType<typeof factorBlocks>[number], { type: 'bar_chart' }>;
    expect(chart.categories[0]).toBe('Rate and credit cycle');
  });

  it('weights quality and counts loss-makers', () => {
    const items = kpi(qualityBlocks(book())).items;
    expect(items.find((i) => i.label === 'Profitable · loss-making')?.value).toBe('5 · 1');
  });

  it('draws the scenario range from volatility, with base equal to today', () => {
    const md = blocksToMarkdown(scenarioBlocks(book()));
    expect(md).toMatch(/Bear/);
    expect(md).toMatch(/not a forecast/);
    const items = kpi(scenarioBlocks(book())).items;
    expect(items[1].note).toBe('Today’s value');
  });

  it('puts the worst weakness first in the register', () => {
    const cards = (riskBlocks(book())[0] as Extract<ReturnType<typeof riskBlocks>[number], { type: 'card_grid' }>).cards;
    expect(cards[0].tag).toBe('CRITICAL');
  });

  it('builds nothing for an empty book', () => {
    expect(healthBlocks([])).toEqual([]);
    expect(factorBlocks([])).toEqual([]);
    expect(qualityBlocks([])).toEqual([]);
  });
});
