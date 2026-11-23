import { describe, expect, it } from 'vitest';
import { DEFAULT_RISK_PROFILE, RISK_PROFILE_IDS, RISK_PROFILES, guardrailDefaultsFor } from './profiles';

describe('risk profiles', () => {
  it('defines every id, with Balanced as the default', () => {
    expect(RISK_PROFILE_IDS).toEqual(['conservative', 'balanced', 'aggressive']);
    expect(DEFAULT_RISK_PROFILE).toBe('balanced');
    for (const id of RISK_PROFILE_IDS) expect(RISK_PROFILES[id].id).toBe(id);
  });

  it('gets looser as risk appetite rises', () => {
    const [c, b, a] = RISK_PROFILE_IDS.map((id) => RISK_PROFILES[id]);
    expect(c.maxPositionPct).toBeLessThan(b.maxPositionPct);
    expect(b.maxPositionPct).toBeLessThan(a.maxPositionPct);
    expect(c.drawdownPct).toBeLessThan(b.drawdownPct);
    expect(b.drawdownPct).toBeLessThan(a.drawdownPct);
    expect(c.trailPct).toBeLessThan(a.trailPct);
  });

  it('exposes only the numbers the alert guardrails use', () => {
    expect(guardrailDefaultsFor('aggressive')).toEqual({
      trailPct: RISK_PROFILES.aggressive.trailPct,
      drawdownPct: RISK_PROFILES.aggressive.drawdownPct,
    });
  });
});
