import { describe, expect, it } from 'vitest';
import { RESEARCH_CHAPTER_SYSTEM, RESEARCH_RISK_SYSTEM } from '@/lib/ai/prompts';
import { computeReport } from './computed';
import type { ReportInputs } from './inputs';
import { buildRisksTask, buildTasks, parseChapterText, parseRisks } from './tasks';

const inputs: ReportInputs = {
  symbol: 'ACME',
  company: { symbol: 'ACME', name: 'Acme Industries Limited', industry: 'Widgets', sector: 'Capital Goods', about: null, source_tier: 't' },
  ratios: [{ name: 'Stock P/E', value: '24', unit: null, as_of: '2026-11-25', source_tier: 't' }],
  profitAndLoss: null, balanceSheet: null, cashFlow: null, ratiosHistory: null, shareholding: null, peers: null, prices: null, announcements: null, insights: null,
};
const none = { business: [], numbers: [], sector: [], legal: [] };

describe('buildTasks', () => {
  const tasks = buildTasks(inputs, computeReport(inputs), none);

  it('covers all eight written chapters in four calls, and the risk register is a fifth', () => {
    expect(tasks.map((t) => t.id)).toEqual(['business', 'numbers', 'sector', 'legal']);
    expect(tasks.flatMap((t) => t.chapters)).toEqual(['overview', 'management', 'financials', 'peers', 'valuation', 'sector', 'regulatory', 'legal']);
  });
  it('lets only the calls that need outside facts search, with a budget', () => {
    const search = Object.fromEntries(tasks.map((t) => [t.id, t.search]));
    expect(search.numbers).toBeNull();
    expect(search.sector).toMatchObject({ maxSearches: 6 });
    expect(search.legal).toMatchObject({ maxSearches: 6, maxPages: 4 });
    expect(search.business?.maxSearches).toBeLessThan(search.legal?.maxSearches ?? 0);
  });
  it('names the company and each chapter marker, and says what was not retrieved', () => {
    const legal = tasks.find((t) => t.id === 'legal')!;
    expect(legal.prompt).toContain('Acme Industries Limited (NSE: ACME)');
    expect(legal.prompt).toContain('## CHAPTER: regulatory');
    expect(legal.prompt).toContain('## CHAPTER: legal');
    expect(legal.prompt).toContain('none was found in the indexed news');
  });
  it('passes retrieved passages through to the prompt', () => {
    const withContext = buildTasks(inputs, computeReport(inputs), { ...none, sector: [{ source: 'ET, 2026-11-01', text: 'Demand is rising.' }] });
    expect(withContext.find((t) => t.id === 'sector')!.prompt).toContain('(ET, 2026-11-01) Demand is rising.');
  });
  it('keeps the guardrail: no advice, no target, a single closing disclaimer', () => {
    expect(RESEARCH_CHAPTER_SYSTEM).toMatch(/no buy, sell or hold view, no price target/);
    expect(RESEARCH_CHAPTER_SYSTEM).toMatch(/never forecasts/);
    expect(RESEARCH_CHAPTER_SYSTEM).toMatch(/Never invent a figure/);
    expect(RESEARCH_CHAPTER_SYSTEM).toMatch(/not proof of zero/);
    expect(RESEARCH_CHAPTER_SYSTEM).toMatch(/never nested bullets/);
    expect(RESEARCH_CHAPTER_SYSTEM).toContain('This is a synthesis of public data, not investment advice.');
    expect(RESEARCH_RISK_SYSTEM).toMatch(/Reply with ONLY a JSON object/);
  });
});

describe('buildRisksTask', () => {
  it('reads the computed indicators and a trimmed summary of each chapter, and does not search', () => {
    const task = buildRisksTask(inputs, computeReport(inputs), { overview: `${'Long text. '.repeat(200)}`, legal: 'One litigation matter.' });
    expect(task.search).toBeNull();
    expect(task.system).toBe(RESEARCH_RISK_SYSTEM);
    expect(task.prompt).toContain('Chapter summary: Business and thesis');
    expect(task.prompt).toContain('One litigation matter.');
    expect(task.prompt.length).toBeLessThan(5000);
  });
});

describe('parseChapterText', () => {
  const ids = ['overview', 'management'] as const;

  it('splits a reply on its chapter lines and drops the closing disclaimer', () => {
    const reply = '## CHAPTER: overview\nThe business sells widgets.\n\n## CHAPTER: management\nThe promoter holds 50%.\n\nThis is a synthesis of public data, not investment advice.';
    expect(parseChapterText(reply, ids)).toEqual({ overview: 'The business sells widgets.', management: 'The promoter holds 50%.' });
  });
  it('tolerates other heading depths, spacing and case', () => {
    const reply = '### Chapter : Overview\nText A.\n#CHAPTER: MANAGEMENT\nText B.';
    expect(parseChapterText(reply, ids)).toEqual({ overview: 'Text A.', management: 'Text B.' });
  });
  it('leaves a missing chapter out and ignores an id it was not asked for', () => {
    const reply = '## CHAPTER: overview\nOnly this.\n\n## CHAPTER: valuation\nNot requested.';
    expect(parseChapterText(reply, ids)).toEqual({ overview: 'Only this.' });
  });
  it('keeps the markdown inside a chapter, headings and lists included', () => {
    const reply = '## CHAPTER: overview\n### Moat\n- Scale\n- Switching costs';
    expect(parseChapterText(reply, ids).overview).toBe('### Moat\n- Scale\n- Switching costs');
  });
  it('takes an unmarked reply as the chapter when only one was asked for, and not otherwise', () => {
    expect(parseChapterText('Just prose here.', ['sector'])).toEqual({ sector: 'Just prose here.' });
    expect(parseChapterText('Just prose here.', ids)).toEqual({});
  });
  it('returns nothing for an empty reply', () => {
    expect(parseChapterText('', ids)).toEqual({});
  });
});

describe('parseRisks', () => {
  const risk = { category: 'Financial', risk: 'Refinancing of a large bond issue', probability: 'Medium', severity: 'High', watch: 'Credit spreads' };
  it('reads the JSON, also when fenced or surrounded by text', () => {
    expect(parseRisks(JSON.stringify({ risks: [risk] }))).toHaveLength(1);
    expect(parseRisks('```json\n' + JSON.stringify({ risks: [risk] }) + '\n```')).toHaveLength(1);
    expect(parseRisks('Here is the register: ' + JSON.stringify({ risks: [risk] }))).toHaveLength(1);
  });
  it('is null for prose, an empty register or an unknown category', () => {
    expect(parseRisks('The main risk is debt.')).toBeNull();
    expect(parseRisks('{"risks": []}')).toBeNull();
    expect(parseRisks(JSON.stringify({ risks: [{ ...risk, category: 'Weather' }] }))).toBeNull();
  });
});
