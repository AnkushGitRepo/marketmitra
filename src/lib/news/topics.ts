// Topic tagging for news headlines. Deterministic keyword rules, so a story always lands in the same place and the rules can
// be read, tested and argued with. These are tags, not analysis: a headline that matches nothing is simply untagged.

export type NewsTopic = 'earnings' | 'macro' | 'technical' | 'regulatory';

/** In display order. */
export const NEWS_TOPICS: readonly NewsTopic[] = ['earnings', 'macro', 'technical', 'regulatory'];

export const TOPIC_LABEL: Record<NewsTopic, string> = {
  earnings: 'Earnings & Results',
  macro: 'Macro & Economy',
  technical: 'Technical Patterns',
  regulatory: 'Regulatory',
};

/** Short form for the label on a story card. */
export const TOPIC_SHORT: Record<NewsTopic, string> = {
  earnings: 'Earnings',
  macro: 'Macro',
  technical: 'Technical',
  regulatory: 'Regulatory',
};

const RULES: readonly { readonly topic: NewsTopic; readonly pattern: RegExp }[] = [
  // Checked first: "PNB penalised by RBI" is a regulatory story, not a macro one.
  {
    topic: 'regulatory',
    pattern:
      /\b(sebi|penali[sz]ed?|penalt(?:y|ies)|fined?|nclt|show[- ]cause|probe|ban(?:s|ned)?|non-?compliance|violations?|tribunal|supreme court|high court|enforcement directorate|regulator(?:s|y)?)\b/i,
  },
  {
    topic: 'earnings',
    pattern: /\b(results?|earnings|q[1-4]|quarterly|net profit|profit after tax|pat|revenue|ebitda|dividend|guidance|y-?o-?y|fy ?\d{2,4})\b/i,
  },
  {
    topic: 'technical',
    pattern:
      /\b(pattern|marubozu|vwap|rsi|macd|moving averages?|[0-9]+-?dma|breakouts?|breakdowns?|support|resistance|candlestick|bollinger|golden cross|death cross|overbought|oversold|52-?week)\b/i,
  },
  {
    topic: 'macro',
    pattern:
      /\b(rbi|repo rate|inflation|cpi|wpi|gdp|crude|oil prices?|brent|fed|federal reserve|rupee|dollar|tariffs?|budget|fiscal|trade deficit|imf|opec|geopolitic\w*|war|ceasefire|trump|treasury|bond yields?|fii|fpi|sensex|nifty)\b/i,
  },
];

/** The topic a headline belongs to, or null when no rule matches. Titles only: summaries are too loose to tag from. */
export function classifyTopic(item: { readonly title: string }): NewsTopic | null {
  return RULES.find((r) => r.pattern.test(item.title))?.topic ?? null;
}
