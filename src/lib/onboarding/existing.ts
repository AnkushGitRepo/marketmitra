// Copy for a returning user who opens /onboarding with a setup already in place. Every claim here mirrors what the app
// really does: a risk profile only affects stocks added afterwards and the Portfolio concentration warning.

import { RISK_PROFILES, type RiskProfileId } from './profiles';

/** "13 holdings · Balanced growth", leaving out whichever part is missing. */
export function existingSetupSummary(holdingsCount: number, profile: RiskProfileId | null): string | null {
  const parts = [
    ...(holdingsCount > 0 ? [`${holdingsCount} ${holdingsCount === 1 ? 'holding' : 'holdings'}`] : []),
    ...(profile ? [RISK_PROFILES[profile].label] : []),
  ];
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function riskChangeNotice(from: RiskProfileId, to: RiskProfileId, holdingsCount: number): string {
  const a = RISK_PROFILES[from];
  const b = RISK_PROFILES[to];
  const existing =
    holdingsCount > 0 ? ` Alerts already created for your ${holdingsCount} ${holdingsCount === 1 ? 'holding' : 'holdings'} are not changed.` : '';
  return (
    `Switching to ${b.label} changes the default alerts for stocks you add from now on ` +
    `(trailing stop ${a.trailPct}% → ${b.trailPct}%, drawdown ${a.drawdownPct}% → ${b.drawdownPct}%) ` +
    `and the single-stock warning on the Portfolio page (${a.maxPositionPct}% → ${b.maxPositionPct}%).${existing}`
  );
}
