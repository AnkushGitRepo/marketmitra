import { describe, expect, it } from 'vitest';
import { answerText, hasReplyContent, parseAskUserInput } from './askUser';

const valid = { question: 'How long will you hold it?', options: [{ label: 'Under 1 year' }, { label: '5+ years', description: 'Long term' }] };

describe('parseAskUserInput', () => {
  it('accepts a question with 2 to 6 options', () => {
    expect(parseAskUserInput(valid)?.options).toHaveLength(2);
  });

  it.each([
    ['one option', { ...valid, options: [{ label: 'Only' }] }],
    ['seven options', { ...valid, options: Array.from({ length: 7 }, (_, i) => ({ label: `o${i}` })) }],
    ['blank question', { ...valid, question: '  ' }],
    ['blank label', { ...valid, options: [{ label: ' ' }, { label: 'b' }] }],
    ['partial streaming input', { question: 'How' }],
    ['not an object', null],
  ])('rejects %s', (_name, input) => {
    expect(parseAskUserInput(input)).toBeNull();
  });
});

describe('answerText', () => {
  it('repeats the question so the answer stands alone', () => {
    expect(answerText('How long?', ['5+ years'])).toBe('How long?\n5+ years');
  });
  it('joins several picks and a typed answer', () => {
    expect(answerText(' Which? ', ['A', 'B'], ' my own ')).toBe('Which?\nA, B, my own');
  });
  it('ignores a blank typed answer', () => {
    expect(answerText('Q', ['A'], '   ')).toBe('Q\nA');
  });
});

describe('hasReplyContent', () => {
  it('is true for text or a pending question', () => {
    expect(hasReplyContent([{ type: 'text', text: 'Hi' }])).toBe(true);
    expect(hasReplyContent([{ type: 'tool-ask_user' }])).toBe(true);
  });
  it('is false for empty text and other tool calls', () => {
    expect(hasReplyContent([{ type: 'text', text: '  ' }, { type: 'tool-run_screener' }])).toBe(false);
  });
});
