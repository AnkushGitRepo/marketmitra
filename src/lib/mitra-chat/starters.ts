// The empty state of Mitra chat: a time-of-day greeting, a one-line portfolio status, and starter prompts built from the
// user's own holdings. Pure: the clock and the money formatter are passed in, so it tests without mocks. Prompts ask for
// analysis, never for a buy/sell/hold call (Mitra's guardrail would refuse it anyway).

import {
  concentration,
  holdingReturnPct,
  returnRanking,
  sectorWeights,
  type HoldingLike,
} from '@/lib/portfolio/portfolioMetrics';

const IST = 'Asia/Kolkata';
const TOP_N = 3;
const MIN_HOLDINGS_FOR_CONCENTRATION = 3;

/** "Good morning" / "Good afternoon" / "Good evening" by the hour in India, with the first name when known. */
export function greetingFor(now: Date, firstName?: string | null): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', hourCycle: 'h23' }).format(now));
  const word = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = firstName?.trim();
  return name ? `${word}, ${name}` : word;
}

/** "Your portfolio is at ₹52,072 (+₹773 today)."; null when nothing is priced. `format` renders an absolute rupee amount (and can mask it). */
export function portfolioStatus(
  totals: { readonly totalValue: number; readonly todayChange: number },
  format: (amount: number) => string
): string | null {
  if (totals.totalValue <= 0) return null;
  const change = totals.todayChange;
  const move = change === 0 ? 'flat today' : `${change > 0 ? '+' : '-'}${format(Math.abs(change))} today`;
  return `Your portfolio is at ${format(totals.totalValue)} (${move}).`;
}

export type StarterId = 'concentration' | 'sector' | 'winner' | 'drawdown' | 'document' | 'compare' | 'ipo' | 'start';

export interface StarterPrompt {
  readonly id: StarterId;
  readonly icon: string;
  readonly title: string;
  /** What is sent (action `send`) or put in the box once a file is chosen (action `attach`). */
  readonly prompt: string;
  readonly action: 'send' | 'attach';
}

const DOCUMENT_CARD: StarterPrompt = {
  id: 'document',
  icon: '📑',
  title: 'Concall / annual report',
  prompt: 'Summarise this document: the key numbers, the risks, and what management said.',
  action: 'attach',
};

/** Shown when there are no holdings (or none priced yet). */
export const FALLBACK_STARTERS: readonly StarterPrompt[] = [
  { id: 'compare', icon: '⚖️', title: 'Compare two stocks', prompt: 'Compare TCS and Infosys on margins, growth and valuation', action: 'send' },
  { id: 'ipo', icon: '🚀', title: 'Before an IPO', prompt: 'What should I check before applying for an IPO?', action: 'send' },
  { id: 'start', icon: '🧭', title: 'Build a portfolio', prompt: 'How should I think about diversifying a first portfolio of Indian stocks?', action: 'send' },
  DOCUMENT_CARD,
];

const pct = (n: number): string => n.toFixed(1);
const signedPct = (n: number): string => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

/** Four cards from the real holdings: concentration, sector, winner (or drawdown), and a document card. */
export function buildStarterPrompts(holdings: readonly HoldingLike[]): StarterPrompt[] {
  const priced = holdings.filter((h) => h.ltp !== null);
  if (priced.length === 0) return [...FALLBACK_STARTERS];

  const { top3Pct } = concentration(priced);
  const topNames = [...priced]
    .sort((a, b) => b.quantity * (b.ltp ?? 0) - a.quantity * (a.ltp ?? 0))
    .slice(0, TOP_N)
    .map((h) => h.name);
  const concentrationCard: StarterPrompt =
    priced.length >= MIN_HOLDINGS_FOR_CONCENTRATION
      ? {
          id: 'concentration',
          icon: '⚠️',
          title: 'Concentration check',
          prompt: `Evaluate the risk: ${pct(top3Pct)}% of my portfolio value is in my top ${TOP_N} holdings (${topNames.join(', ')}). What does that mean for me?`,
          action: 'send',
        }
      : {
          id: 'concentration',
          icon: '⚠️',
          title: 'Concentration check',
          prompt: `I hold only ${priced.length} stock${priced.length === 1 ? '' : 's'} (${topNames.join(', ')}). What should I check about concentration and diversification?`,
          action: 'send',
        };

  const topSector = sectorWeights(priced)[0];
  const sectorCard: StarterPrompt = {
    id: 'sector',
    icon: '⚖️',
    title: 'Sector exposure',
    prompt: topSector
      ? `I have ${pct(topSector.pct)}% of my portfolio in ${topSector.name}. How should I think about diversifying?`
      : 'How should I think about sector exposure across my holdings?',
    action: 'send',
  };

  const { gainers, losers } = returnRanking(priced);
  const best = gainers[0];
  const worst = losers[0];
  const third: StarterPrompt | null = best
    ? {
        id: 'winner',
        icon: '🚀',
        title: 'Top winner review',
        prompt: `Analyse ${best.name}'s valuation after its recent gains (${signedPct(holdingReturnPct(best) ?? 0)} since I bought it). Is the rally backed by fundamentals?`,
        action: 'send',
      }
    : worst
      ? {
          id: 'drawdown',
          icon: '📉',
          title: 'Drawdown review',
          prompt: `${worst.name} is down ${signedPct(holdingReturnPct(worst) ?? 0)} since I bought it. What has changed in the business and the news?`,
          action: 'send',
        }
      : null;

  return [concentrationCard, sectorCard, ...(third ? [third] : []), DOCUMENT_CARD];
}
