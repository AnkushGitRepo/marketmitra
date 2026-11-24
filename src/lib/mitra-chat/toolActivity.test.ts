import { describe, expect, it } from 'vitest';
import { groupCalls, isActivityPart, stageOf, stageText, summaryText, toolCalls, type PartLike } from './toolActivity';

const noCard = () => false;
const tool = (name: string, state: string): PartLike => ({ type: `tool-${name}`, state });
const text = (t: string): PartLike => ({ type: 'text', text: t });

describe('isActivityPart', () => {
  it('leaves out the question, holding and card tools and non-tool parts', () => {
    expect(isActivityPart('tool-get_quote', noCard)).toBe(true);
    expect(isActivityPart('tool-ask_user', noCard)).toBe(false);
    expect(isActivityPart('tool-propose_holding_change', noCard)).toBe(false);
    expect(isActivityPart('tool-show_portfolio_snapshot', (t) => t === 'tool-show_portfolio_snapshot')).toBe(false);
    expect(isActivityPart('text', noCard)).toBe(false);
  });
});

describe('groupCalls and summaryText', () => {
  const parts = [tool('list_ipos', 'output-available'), tool('get_news', 'output-available'), tool('list_ipos', 'output-error'), tool('ask_user', 'input-available')];
  const calls = toolCalls(parts, noCard);

  it('counts every call but shows each tool once, in first-use order', () => {
    expect(summaryText(calls)).toBe('Used 3 tools');
    expect(groupCalls(calls)).toEqual([
      { name: 'list_ipos', label: 'list ipos', count: 2, running: false, failed: true },
      { name: 'get_news', label: 'get news', count: 1, running: false, failed: false },
    ]);
  });

  it('uses the singular for one tool and marks a group running while any call is', () => {
    expect(summaryText(toolCalls([tool('get_quote', 'output-available')], noCard))).toBe('Used 1 tool');
    expect(groupCalls(toolCalls([tool('get_quote', 'output-available'), tool('get_quote', 'input-available')], noCard))[0].running).toBe(true);
  });
});

describe('stageOf and stageText', () => {
  it('is thinking before anything has happened and between tools', () => {
    expect(stageOf([], noCard)).toBe('thinking');
    expect(stageOf([tool('get_quote', 'output-available')], noCard)).toBe('thinking');
    expect(stageText('thinking', [], noCard)).toBe('Thinking it through…');
  });

  it('is researching while a data tool runs, with a phrase for that tool', () => {
    const parts = [tool('get_news', 'input-available')];
    expect(stageOf(parts, noCard)).toBe('researching');
    expect(stageText('researching', parts, noCard)).toBe('Reading the latest news…');
  });

  it('is tool for any other running tool, falling back to its label', () => {
    const parts = [tool('open_screener', 'input-available')];
    expect(stageOf(parts, noCard)).toBe('tool');
    expect(stageText('tool', parts, noCard)).toBe('open screener…');
  });

  it('is writing once there is text and no tool is running', () => {
    expect(stageOf([tool('get_quote', 'output-available'), text('Here is')], noCard)).toBe('writing');
    expect(stageText('writing', [], noCard)).toBe('Writing the answer…');
  });
});
