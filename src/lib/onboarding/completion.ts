// What the wizard's closing screen says. Pure, and every line states only what the app really does: analysts start on
// the next scheduled run (not at once), need the user's own key, and the morning brief only goes out when an analyst
// has logged something material.

import { PROVIDER_LABELS } from '@/lib/ai/providers';
import type { AiProvider } from '@/lib/userSettings';
import { RISK_PROFILES, type RiskProfileId } from './profiles';

export interface CompletionSummary {
  readonly holdings: number;
  readonly analystsQueued: number;
  readonly hasAiKey: boolean;
}

export interface RecapCard {
  readonly title: string;
  readonly value: string;
  readonly lines: readonly string[];
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function completionHeadline(s: CompletionSummary): string {
  return s.holdings > 0 ? 'Your desk is ready' : 'Your setup is saved';
}

export function completionMessage(s: CompletionSummary): string {
  if (s.analystsQueued > 0) return `${plural(s.analystsQueued, 'analyst', 'analysts')} will start building dossiers on the next scheduled run.`;
  if (s.holdings > 0 && !s.hasAiKey) return 'Your holdings are saved. Add an AI key in Settings whenever you are ready, and your analysts will start.';
  if (s.holdings > 0) return 'Your holdings are saved. Automatic analysts are switched off in Settings.';
  return 'Your workspace is configured. Add holdings from the Portfolio page whenever you are ready.';
}

function riskCard(risk: RiskProfileId | null): RecapCard {
  if (!risk) return { title: 'Risk guardrails', value: 'Not chosen', lines: ['Standard default alerts apply to new holdings.'] };
  const p = RISK_PROFILES[risk];
  return { title: 'Risk guardrails', value: p.label, lines: [`${p.trailPct}% trailing stop`, `${p.drawdownPct}% drawdown alert`, `${p.maxPositionPct}% single-stock limit`] };
}

function analystCard(s: CompletionSummary): RecapCard {
  const title = 'Analyst roster';
  if (s.analystsQueued > 0) {
    return { title, value: `${plural(s.analystsQueued, 'analyst', 'analysts')} queued`, lines: ['Start on the next scheduled run', 'Morning brief at 08:30 IST when something material is logged'] };
  }
  if (s.holdings > 0 && !s.hasAiKey) return { title, value: 'Waiting for an AI key', lines: ['Add a key in Settings to start them'] };
  if (s.holdings > 0) return { title, value: 'Automatic analysts off', lines: ['Switch them on in Settings'] };
  return { title, value: 'No holdings yet', lines: ['Add holdings from the Portfolio page'] };
}

function aiCard(provider: AiProvider | null): RecapCard {
  if (!provider) return { title: 'AI engine', value: 'No key yet', lines: ['Risk cards, screener and alerts still work'] };
  return { title: 'AI engine', value: `${PROVIDER_LABELS[provider]} · key saved`, lines: ['Runs on your own key', 'Encrypted at rest'] };
}

export function completionRecap(s: CompletionSummary, risk: RiskProfileId | null, provider: AiProvider | null): RecapCard[] {
  return [riskCard(risk), analystCard(s), aiCard(provider)];
}

/** The first few symbols plus a "+N more" remainder for the ticker strip. */
export function tickerStrip(symbols: readonly string[], max = 5): { readonly shown: string[]; readonly more: number } {
  return { shown: symbols.slice(0, max), more: Math.max(symbols.length - max, 0) };
}
