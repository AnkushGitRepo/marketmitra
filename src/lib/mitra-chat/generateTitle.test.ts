import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { buildTitlePrompt, cleanTitle, hasAnswerText } from './generateTitle';

const msg = (role: 'user' | 'assistant', text: string): UIMessage => ({ id: role + text.length, role, parts: [{ type: 'text', text }] });

describe('cleanTitle', () => {
  it('strips labels, quotes, markdown and end punctuation', () => {
    expect(cleanTitle('Title: "JIO IPO allotment and outlook."')).toBe('JIO IPO allotment and outlook');
    expect(cleanTitle('**Is my portfolio too concentrated?**')).toBe('Is my portfolio too concentrated?');
    expect(cleanTitle('# TCS valuation check -')).toBe('TCS valuation check');
  });

  it('keeps only the first line and a handful of words', () => {
    expect(cleanTitle('\nHDFC Pharma outlook\nHere is why...')).toBe('HDFC Pharma outlook');
    expect(cleanTitle('one two three four five six seven eight nine ten')).toBe('one two three four five six seven eight…');
  });

  it('returns null when nothing usable is left', () => {
    expect(cleanTitle('')).toBeNull();
    expect(cleanTitle('"" **')).toBeNull();
    // A single word is a cut-off reply, not a title.
    expect(cleanTitle('Understanding')).toBeNull();
  });
});

describe('buildTitlePrompt', () => {
  it('uses only the first few messages and caps their length', () => {
    const many = Array.from({ length: 10 }, (_, i) => msg(i % 2 ? 'assistant' : 'user', `message ${i} ${'x'.repeat(400)}`));
    const prompt = buildTitlePrompt(many);
    expect(prompt).toContain('message 0');
    expect(prompt).not.toContain('message 5');
    expect(prompt.length).toBeLessThan(1400);
  });
});

describe('hasAnswerText', () => {
  it('needs a Mitra reply with text, not only a question card', () => {
    expect(hasAnswerText([msg('user', 'add JIO')])).toBe(false);
    expect(hasAnswerText([msg('user', 'add JIO'), { id: 'a', role: 'assistant', parts: [{ type: 'tool-ask_user', toolCallId: 'c', state: 'input-available', input: {} } as never] }])).toBe(false);
    expect(hasAnswerText([msg('user', 'add JIO'), msg('assistant', 'JIO lists on...')])).toBe(true);
  });
});
