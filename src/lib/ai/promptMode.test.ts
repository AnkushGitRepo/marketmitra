import { describe, expect, it } from 'vitest';
import { GUARDRAIL, STOCK_SYSTEM } from './prompts';
import { UNRESTRICTED_DISCLAIMER, UNRESTRICTED_RULES, promptForMode, selectPromptMode } from './promptMode';

describe('selectPromptMode', () => {
  it('is guarded by default', () => {
    expect(selectPromptMode({ hosted: false, unrestricted: false })).toBe('guarded');
  });
  it('is unrestricted only when local and switched on', () => {
    expect(selectPromptMode({ hosted: false, unrestricted: true })).toBe('unrestricted');
  });
  it('is always guarded when hosted, whatever the stored setting says', () => {
    expect(selectPromptMode({ hosted: true, unrestricted: true })).toBe('guarded');
    expect(selectPromptMode({ hosted: true, unrestricted: false })).toBe('guarded');
  });
});

describe('promptForMode', () => {
  it('returns the guarded prompt untouched in guarded mode', () => {
    expect(promptForMode(STOCK_SYSTEM, 'guarded')).toBe(STOCK_SYSTEM);
    expect(promptForMode(STOCK_SYSTEM, 'guarded')).toContain(GUARDRAIL);
  });
  it('swaps the guardrail for the unrestricted rules, keeping the role text', () => {
    const out = promptForMode(STOCK_SYSTEM, 'unrestricted');
    expect(out).not.toContain(GUARDRAIL);
    expect(out).not.toContain('do NOT give a buy');
    expect(out.startsWith(STOCK_SYSTEM.slice(0, STOCK_SYSTEM.length - GUARDRAIL.length))).toBe(true);
    expect(out.endsWith(UNRESTRICTED_RULES)).toBe(true);
  });
  it('still forbids inventing data and promising returns, and demands the disclaimer', () => {
    expect(UNRESTRICTED_RULES).toMatch(/never invent/i);
    expect(UNRESTRICTED_RULES).toMatch(/never promise or guarantee/i);
    expect(UNRESTRICTED_RULES).toContain(UNRESTRICTED_DISCLAIMER);
  });
  it('leaves a prompt that has no guardrail suffix unchanged rather than guessing', () => {
    expect(promptForMode('plain prompt', 'unrestricted')).toBe('plain prompt');
  });
});
