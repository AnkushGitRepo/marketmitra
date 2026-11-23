import { describe, expect, it } from 'vitest';
import { existingSetupSummary, riskChangeNotice } from './existing';

describe('existingSetupSummary', () => {
  it('joins holdings and profile', () => {
    expect(existingSetupSummary(13, 'balanced')).toBe('13 holdings · Balanced growth');
    expect(existingSetupSummary(1, null)).toBe('1 holding');
    expect(existingSetupSummary(0, 'aggressive')).toBe('Aggressive');
  });
  it('is null when there is nothing set up', () => {
    expect(existingSetupSummary(0, null)).toBeNull();
  });
});

describe('riskChangeNotice', () => {
  it('states the real before/after numbers and that existing alerts stay', () => {
    const text = riskChangeNotice('balanced', 'aggressive', 13);
    expect(text).toContain('trailing stop 10% → 15%');
    expect(text).toContain('drawdown 20% → 30%');
    expect(text).toContain('15% → 20%');
    expect(text).toContain('Alerts already created for your 13 holdings are not changed.');
  });
  it('leaves the existing-alerts sentence out with no holdings', () => {
    expect(riskChangeNotice('conservative', 'balanced', 0)).not.toContain('already created');
  });
});
