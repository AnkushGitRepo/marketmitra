import type { InvestmentPolicy } from '../policy/schema';

// One-click starting points so the Advisor works before anyone writes a policy.
// A saved policy always wins over a preset.

export const PROFILE_IDS = ['conservative', 'balanced', 'aggressive'] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

export interface Limits {
  readonly maxStockPct: number;
  readonly maxSectorPct: number;
}

export type Target = InvestmentPolicy['targetAllocation'];

export interface Profile {
  readonly id: ProfileId;
  readonly label: string;
  readonly blurb: string;
  readonly limits: Limits;
  readonly target: Target;
}

export const DEFAULT_PROFILE: ProfileId = 'balanced';

export const PROFILES: Readonly<Record<ProfileId, Profile>> = {
  conservative: {
    id: 'conservative',
    label: 'Conservative',
    blurb: 'Wide diversification, a large cash and index share.',
    limits: { maxStockPct: 8, maxSectorPct: 25 },
    target: { indexCorePct: 65, satellitePct: 10, cashPct: 25 },
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced growth',
    blurb: 'Index core with a measured satellite of single stocks.',
    limits: { maxStockPct: 10, maxSectorPct: 30 },
    target: { indexCorePct: 55, satellitePct: 30, cashPct: 15 },
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive alpha',
    blurb: 'Larger single-stock and sector positions, little cash.',
    limits: { maxStockPct: 15, maxSectorPct: 40 },
    target: { indexCorePct: 35, satellitePct: 60, cashPct: 5 },
  },
};

export function parseProfile(value: string | null | undefined): ProfileId {
  return PROFILE_IDS.find((id) => id === value) ?? DEFAULT_PROFILE;
}

export interface EffectiveRules {
  readonly source: 'policy' | 'preset';
  readonly profile: ProfileId;
  readonly limits: Limits;
  readonly target: Target;
  readonly excludedSectors: readonly string[];
  readonly excludedTickers: readonly string[];
}

export function effectiveRules(profile: ProfileId, policy: InvestmentPolicy | null): EffectiveRules {
  if (policy) {
    return {
      source: 'policy',
      profile,
      limits: { maxStockPct: policy.maxPositionPct, maxSectorPct: policy.maxSectorPct },
      target: policy.targetAllocation,
      excludedSectors: policy.excludedSectors,
      excludedTickers: policy.excludedTickers,
    };
  }
  const p = PROFILES[profile];
  return { source: 'preset', profile, limits: p.limits, target: p.target, excludedSectors: [], excludedTickers: [] };
}

/** A full policy built from a preset, for pre-filling the rules drawer. */
export function policyFromProfile(profile: ProfileId, base: InvestmentPolicy): InvestmentPolicy {
  const p = PROFILES[profile];
  return { ...base, targetAllocation: p.target, maxPositionPct: p.limits.maxStockPct, maxSectorPct: p.limits.maxSectorPct };
}
