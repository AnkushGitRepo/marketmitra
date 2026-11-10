import { describe, expect, it } from 'vitest';
import { CHAT_SYSTEM_AGENTIC, GUARDRAIL, MITRA_WORKSPACE_SYSTEM, SCREENER_PLAYBOOK } from './prompts';
import { SCREENER_RANGE_FIELDS } from '@/lib/dashboard/screenerSchema';

describe('Mitra screening prompt', () => {
  it('is part of the agentic chat prompt, alongside the non-negotiable guardrail', () => {
    expect(CHAT_SYSTEM_AGENTIC).toContain(SCREENER_PLAYBOOK);
    expect(CHAT_SYSTEM_AGENTIC).toContain(GUARDRAIL);
  });

  it('names every screener field, so a renamed field cannot silently desync the playbook', () => {
    for (const field of SCREENER_RANGE_FIELDS) {
      expect(SCREENER_PLAYBOOK).toContain(field.key);
    }
  });

  it('keeps the honesty rules: past data, no predictions, no buy calls', () => {
    expect(SCREENER_PLAYBOOK).toMatch(/past/i);
    expect(SCREENER_PLAYBOOK).toMatch(/never predict/i);
    expect(SCREENER_PLAYBOOK).toMatch(/good buy/i);
  });

  it('forbids guessing sector names and covers "A or B" sectors', () => {
    expect(SCREENER_PLAYBOOK).toMatch(/get_screener_options/);
    expect(SCREENER_PLAYBOOK).toMatch(/never guess/i);
    expect(SCREENER_PLAYBOOK).toMatch(/ONE sector/);
  });

  it('tells the model to tune with run_screener and open the screen once', () => {
    expect(SCREENER_PLAYBOOK).toMatch(/run_screener/);
    expect(SCREENER_PLAYBOOK).toMatch(/open_screener.*ONCE/);
  });
});

describe('Mitra workspace prompt', () => {
  it('carries the non-negotiable guardrail and the screening playbook', () => {
    expect(MITRA_WORKSPACE_SYSTEM).toContain(GUARDRAIL);
    expect(MITRA_WORKSPACE_SYSTEM).toContain(SCREENER_PLAYBOOK);
  });

  it('tells the model how to treat attachments and not to invent figures', () => {
    expect(MITRA_WORKSPACE_SYSTEM).toMatch(/attach/i);
    expect(MITRA_WORKSPACE_SYSTEM).toMatch(/never invent figures/i);
  });

  it('keeps the no-destructive-actions boundary', () => {
    expect(MITRA_WORKSPACE_SYSTEM).toMatch(/no tool for account settings, security, billing or any destructive action/i);
  });
});
