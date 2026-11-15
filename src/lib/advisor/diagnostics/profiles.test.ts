import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY } from '../policy/schema';
import { PROFILES, PROFILE_IDS, effectiveRules, parseProfile } from './profiles';

describe('profiles', () => {
  it('ships three presets whose targets add up to 100', () => {
    expect(PROFILE_IDS).toEqual(['conservative', 'balanced', 'aggressive']);
    for (const id of PROFILE_IDS) {
      const t = PROFILES[id].target;
      expect(t.indexCorePct + t.satellitePct + t.cashPct).toBe(100);
    }
  });

  it('gets tighter limits the more conservative the profile is', () => {
    expect(PROFILES.conservative.limits.maxStockPct).toBeLessThan(PROFILES.aggressive.limits.maxStockPct);
    expect(PROFILES.conservative.limits.maxSectorPct).toBeLessThan(PROFILES.aggressive.limits.maxSectorPct);
  });

  it('parses a profile id and falls back to balanced', () => {
    expect(parseProfile('aggressive')).toBe('aggressive');
    expect(parseProfile('nonsense')).toBe('balanced');
    expect(parseProfile(undefined)).toBe('balanced');
  });

  it('uses the preset when there is no saved policy', () => {
    const rules = effectiveRules('conservative', null);
    expect(rules.source).toBe('preset');
    expect(rules.limits).toEqual(PROFILES.conservative.limits);
    expect(rules.excludedSectors).toEqual([]);
    expect(rules.drawdownTolerancePct).toBe(PROFILES.conservative.drawdownTolerancePct);
  });

  it('uses the saved policy over the preset', () => {
    const policy = { ...DEFAULT_POLICY, maxPositionPct: 12, maxSectorPct: 35, maxTolerableDrawdownPct: 40, excludedSectors: ['Tobacco'], excludedTickers: ['XYZ'] };
    const rules = effectiveRules('aggressive', policy);
    expect(rules.source).toBe('policy');
    expect(rules.limits).toEqual({ maxStockPct: 12, maxSectorPct: 35 });
    expect(rules.target).toEqual(policy.targetAllocation);
    expect(rules.drawdownTolerancePct).toBe(40);
    expect(rules.excludedSectors).toEqual(['Tobacco']);
    expect(rules.excludedTickers).toEqual(['XYZ']);
  });
});
