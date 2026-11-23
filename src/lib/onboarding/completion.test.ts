import { describe, expect, it } from 'vitest';
import { completionHeadline, completionMessage, completionRecap, tickerStrip } from './completion';

const queued = { holdings: 13, analystsQueued: 13, hasAiKey: true };

describe('completionMessage', () => {
  it('says analysts start on the next run, not that they are live', () => {
    expect(completionMessage(queued)).toBe('13 analysts will start building dossiers on the next scheduled run.');
    expect(completionMessage({ ...queued, analystsQueued: 1 })).toMatch(/^1 analyst will/);
  });
  it('explains why none are queued', () => {
    expect(completionMessage({ holdings: 3, analystsQueued: 0, hasAiKey: false })).toMatch(/Add an AI key/);
    expect(completionMessage({ holdings: 3, analystsQueued: 0, hasAiKey: true })).toMatch(/switched off/);
    expect(completionMessage({ holdings: 0, analystsQueued: 0, hasAiKey: false })).toMatch(/Add holdings/);
  });
});

describe('completionHeadline', () => {
  it('depends on whether there are holdings', () => {
    expect(completionHeadline(queued)).toBe('Your desk is ready');
    expect(completionHeadline({ holdings: 0, analystsQueued: 0, hasAiKey: false })).toBe('Your setup is saved');
  });
});

describe('completionRecap', () => {
  it('shows the real numbers of the chosen profile, queued analysts and the saved provider', () => {
    const [risk, analysts, ai] = completionRecap(queued, 'balanced', 'gemini');
    expect(risk.value).toBe('Balanced growth');
    expect(risk.lines).toEqual(['10% trailing stop', '20% drawdown alert', '15% single-stock limit']);
    expect(analysts.value).toBe('13 analysts queued');
    expect(analysts.lines.join(' ')).toContain('08:30 IST when something material is logged');
    expect(ai.value).toBe('Google Gemini · key saved');
    expect(ai.lines).not.toContain('Unlimited');
  });
  it('is honest when nothing was set up', () => {
    const [risk, analysts, ai] = completionRecap({ holdings: 0, analystsQueued: 0, hasAiKey: false }, null, null);
    expect(risk.value).toBe('Not chosen');
    expect(analysts.value).toBe('No holdings yet');
    expect(ai.value).toBe('No key yet');
  });
  it('does not promise a morning brief when no analysts are queued', () => {
    const [, analysts] = completionRecap({ holdings: 2, analystsQueued: 0, hasAiKey: false }, 'balanced', null);
    expect(analysts.lines.join(' ')).not.toMatch(/08:30/);
  });
});

describe('tickerStrip', () => {
  it('shows five and counts the rest', () => {
    expect(tickerStrip(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toEqual({ shown: ['A', 'B', 'C', 'D', 'E'], more: 2 });
    expect(tickerStrip(['A'])).toEqual({ shown: ['A'], more: 0 });
  });
});
