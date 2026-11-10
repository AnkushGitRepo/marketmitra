import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { planWindow, messageChars } from './window';
import { CONTEXT_MAX_CHARS, CONTEXT_MAX_MESSAGES } from './limits';

const msg = (role: 'user' | 'assistant', text: string, id = Math.random().toString()): UIMessage => ({
  id,
  role,
  parts: [{ type: 'text', text }],
});

const convo = (turns: number, size = 10): UIMessage[] =>
  Array.from({ length: turns * 2 }, (_, i) => msg(i % 2 === 0 ? 'user' : 'assistant', 'x'.repeat(size)));

describe('planWindow', () => {
  it('keeps everything in a short conversation', () => {
    const plan = planWindow(convo(5), 0);
    expect(plan.keepFrom).toBe(0);
    expect(plan.unsummarized).toEqual({ from: 0, to: 0 });
  });

  it('caps the verbatim tail by message count and asks to summarise the rest', () => {
    const messages = convo(40); // 80 messages
    const plan = planWindow(messages, 0);
    expect(messages.length - plan.keepFrom).toBeLessThanOrEqual(CONTEXT_MAX_MESSAGES);
    expect(plan.unsummarized).toEqual({ from: 0, to: plan.keepFrom });
    expect(plan.keepFrom).toBeGreaterThan(0);
  });

  it('starts the kept tail on a user message', () => {
    const plan = planWindow(convo(40), 0);
    expect(convo(40)[plan.keepFrom].role).toBe('user');
  });

  it('caps by characters', () => {
    const messages = convo(10, CONTEXT_MAX_CHARS / 6);
    const plan = planWindow(messages, 0);
    const kept = messages.slice(plan.keepFrom).reduce((s, m) => s + messageChars(m), 0);
    expect(kept).toBeLessThanOrEqual(CONTEXT_MAX_CHARS);
    expect(plan.keepFrom).toBeGreaterThan(0);
  });

  it('always keeps the latest message even if it alone is huge', () => {
    const messages = [msg('user', 'hi'), msg('assistant', 'yo'), msg('user', 'y'.repeat(CONTEXT_MAX_CHARS * 2))];
    expect(planWindow(messages, 0).keepFrom).toBe(2);
  });

  it('only reports the not-yet-summarised slice', () => {
    const messages = convo(40);
    const first = planWindow(messages, 0);
    const second = planWindow(messages, first.keepFrom);
    expect(second.unsummarized.from).toBe(first.keepFrom);
    expect(second.unsummarized.to).toBe(first.keepFrom);
  });

  it('handles an empty conversation', () => {
    expect(planWindow([], 0)).toEqual({ keepFrom: 0, unsummarized: { from: 0, to: 0 } });
  });
});
