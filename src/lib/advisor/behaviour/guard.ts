import type { InvestmentPolicy } from '../policy/schema';
import type { PricePoint } from '../performance/paper';

// Behaviour guard: when markets fall, point the user back at the policy they
// wrote while calm instead of producing fresh advice, and stop repeated
// "buy the dip" requests from being re-served within a cooldown. Pure.

export interface GuardConfig {
  /** A one-day fall of at least this % counts as stress. */
  dayDropPct: number;
  /** A fall of at least this % from the 1-year high counts as stress. */
  drawdownPct: number;
  /** Sessions used for the "1-year high". */
  highWindow: number;
}

export const DEFAULT_GUARD_CONFIG: GuardConfig = { dayDropPct: 2.5, drawdownPct: 10, highWindow: 252 };

export interface MarketStress {
  dayChangePct: number;
  drawdownPct: number;
  stressed: boolean;
}

/** Stress readings from the benchmark's closing prices (ascending). Null if too little data. */
export function assessMarket(series: PricePoint[], cfg: GuardConfig = DEFAULT_GUARD_CONFIG): MarketStress | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1].close;
  const prev = series[series.length - 2].close;
  const window = series.slice(-cfg.highWindow);
  const high = Math.max(...window.map((p) => p.close));
  if (!(prev > 0) || !(high > 0)) return null;
  const dayChangePct = ((last - prev) / prev) * 100;
  const drawdownPct = ((high - last) / high) * 100;
  return {
    dayChangePct,
    drawdownPct,
    stressed: dayChangePct <= -cfg.dayDropPct || drawdownPct >= cfg.drawdownPct,
  };
}

const DIP_PATTERNS: RegExp[] = [
  /\bbuy(ing)?\s+(the\s+)?(dip|crash|correction|fall|sell-?off)\b/i,
  /\b(dip|crash(ed|ing)?|correction|sell-?off|falling|market\s+(is\s+)?(fall\w*|drop\w*))\b[^.?!]{0,50}\b(buy|invest|add|opportunity|enter|average)/i,
  /\b(buy|invest|add|average)\w*\b[^.?!]{0,50}\b(dip|crash|correction|sell-?off|market\s+(fall|drop)|falling|fallen)\b/i,
  /\b(is it|good|right)\s+(a\s+)?(good\s+)?time\s+to\s+(buy|invest|add)\b/i,
];

export function isDipRequest(text: string): boolean {
  return DIP_PATTERNS.some((re) => re.test(text));
}

export interface Cooldown {
  blocked: boolean;
  /** ISO timestamp the next dip question will be engaged with again (when blocked). */
  nextAllowedAt: string | null;
}

export function checkCooldown(args: { lastDipAt: string | null; now: string; cooldownDays: number }): Cooldown {
  if (args.cooldownDays <= 0 || !args.lastDipAt) return { blocked: false, nextAllowedAt: null };
  const next = Date.parse(args.lastDipAt) + args.cooldownDays * 86_400_000;
  return Date.parse(args.now) < next
    ? { blocked: true, nextAllowedAt: new Date(next).toISOString() }
    : { blocked: false, nextAllowedAt: null };
}

const f1 = (n: number) => n.toFixed(1);

/** What the plan expected, in the user's own terms. */
function policyLine(policy: InvestmentPolicy, market: MarketStress | null): string {
  const tol = policy.maxTolerableDrawdownPct;
  const base = `Your policy expected drawdowns of up to ${tol}%`;
  if (!market) return `${base}.`;
  const dd = f1(market.drawdownPct);
  return market.drawdownPct <= tol
    ? `${base}; the Nifty 50 fund is ${dd}% below its 1-year high, which is inside that range.`
    : `${base}; the Nifty 50 fund is ${dd}% below its 1-year high, which is beyond that range — that is a moment to re-read your own policy, not to improvise.`;
}

export function dipCooldownReply(policy: InvestmentPolicy, market: MarketStress | null, nextAllowedAt: string): string {
  return [
    `I've already gone through this with you recently, so I won't generate another “buy the dip” view.`,
    policyLine(policy, market),
    `Your plan is to invest ₹${Math.round(policy.monthlyContributionINR).toLocaleString('en-IN')} a month on schedule — no action is required because of a fall. If you want to change the plan, change it in your policy when markets are calm.`,
    `I'll engage with this question again after ${nextAllowedAt.slice(0, 10)}.`,
  ].join(' ');
}

/** The system-prompt block that puts Mitra on the user's policy. */
export function policyPromptBlock(policy: InvestmentPolicy, market: MarketStress | null, opts: { dipRequest: boolean }): string {
  const lines = [
    '--- INVESTMENT POLICY (the user\'s own rules; you cannot change them) ---',
    `Target allocation: ${policy.targetAllocation.indexCorePct}% index core / ${policy.targetAllocation.satellitePct}% satellite stocks / ${policy.targetAllocation.cashPct}% cash. Monthly contribution ₹${Math.round(policy.monthlyContributionINR).toLocaleString('en-IN')}. Horizon ${policy.horizonYears} years. Max tolerable drawdown ${policy.maxTolerableDrawdownPct}%.`,
    `Reference: ${policyLine(policy, market)}`,
    'Advisor tools (advisor_policy_summary, advisor_current_plan, advisor_memo, advisor_journal, advisor_performance) are read-only. Use them for questions about the user\'s plan, memos, journal or performance, and quote their numbers exactly.',
  ];
  if (market?.stressed) {
    lines.push(
      `Markets are under stress today (Nifty 50 fund ${f1(market.dayChangePct)}% on the day, ${f1(market.drawdownPct)}% below its 1-year high). If the user is worried or asks what to do, answer from their policy: say what it expected and that no action is required; do NOT produce new buy or sell suggestions.`,
    );
  }
  if (opts.dipRequest) {
    lines.push(
      'The user is asking about buying a dip. Do not recommend buying more, any stock, or any amount. Explain what their policy says (their scheduled contribution continues; any change belongs in the policy, made when calm), and offer to show their plan. Keep it short.',
    );
  }
  return lines.join('\n');
}
