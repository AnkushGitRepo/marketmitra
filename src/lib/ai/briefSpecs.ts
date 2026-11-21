// What each Mitra widget returns (#125, ADR 0057): a few fixed, labelled items. The key set and the wording of the labels live here
// so the prompt, the parser and the UI agree.

export type BriefSurface = 'dashboard' | 'market' | 'news' | 'ipo' | 'fund';
export type Tone = 'positive' | 'neutral' | 'warning';

export interface BriefItemSpec {
  key: string;
  /** Shown as the item's badge. */
  label: string;
  /** Words a model may use for this item instead of the key ("Net Impact", "Key Red Flag", ...). */
  aliases: readonly string[];
}

export interface BriefSpec {
  surface: BriefSurface;
  items: readonly BriefItemSpec[];
  /** Badge text for each tone on this surface. */
  toneLabels: Readonly<Record<Tone, string>>;
  /** Items the model must always include; a cut-off reply with fewer is not stored. */
  minItems: number;
}

const DEFAULT_TONES = { positive: 'Positive', neutral: 'Neutral', warning: 'Watch' } as const;

export const DASHBOARD_SPEC: BriefSpec = {
  surface: 'dashboard',
  minItems: 2,
  toneLabels: DEFAULT_TONES,
  items: [
    { key: 'return', label: 'Return driver', aliases: ['return', 'driver', 'impact', 'net', 'pnl'] },
    { key: 'exposure', label: 'Exposure check', aliases: ['exposure', 'skew', 'concentration', 'sector', 'holding', 'overweight'] },
    { key: 'risk', label: 'Risk trigger', aliases: ['risk', 'trigger', 'guardrail', 'watch', 'stop', 'alert'] },
  ],
};

export const MARKET_SPEC: BriefSpec = {
  surface: 'market',
  minItems: 2,
  toneLabels: DEFAULT_TONES,
  items: [
    { key: 'breadth', label: 'Breadth', aliases: ['breadth', 'tone', 'advance', 'decline'] },
    { key: 'leaders', label: 'Leaders & laggards', aliases: ['leader', 'laggard', 'sector', 'rotation'] },
    { key: 'catalyst', label: 'Catalyst', aliases: ['catalyst', 'macro', 'driver', 'news'] },
  ],
};

export const NEWS_SPEC: BriefSpec = {
  surface: 'news',
  minItems: 2,
  toneLabels: { positive: 'Positive', neutral: 'Developing', warning: 'Negative' },
  items: [
    { key: 'earnings', label: 'Earnings / corporate', aliases: ['earnings', 'corporate', 'company', 'deal'] },
    { key: 'macro', label: 'Macro / policy', aliases: ['macro', 'policy', 'regulat', 'rbi', 'sebi'] },
    { key: 'sector', label: 'Sector focus', aliases: ['sector', 'focus', 'narrative', 'theme'] },
  ],
};

export const IPO_SPEC: BriefSpec = {
  surface: 'ipo',
  minItems: 3,
  toneLabels: DEFAULT_TONES,
  items: [
    { key: 'listing', label: 'Listing signal', aliases: ['listing', 'gmp', 'signal', 'potential'] },
    { key: 'offer', label: 'Offer structure', aliases: ['offer', 'structure', 'size', 'issue'] },
    { key: 'business', label: 'Business', aliases: ['business', 'moat', 'company', 'edge'] },
    { key: 'risk', label: 'Key risk', aliases: ['risk', 'redflag', 'flag', 'concern'] },
    // Only ever written in unrestricted mode (ADR 0054, 0070); the route drops them from a guarded brief.
    { key: 'listingcall', label: 'Listing call', aliases: ['listingcall', 'listinggain'] },
    { key: 'longterm', label: 'Long-term call', aliases: ['longterm', 'holdcall'] },
    { key: 'strategy', label: 'Best category', aliases: ['strategy', 'bestcategory', 'applycategory'] },
  ],
};

/** The IPO items only an unrestricted brief may carry. */
export const IPO_VERDICT_KEYS: readonly string[] = ['listingcall', 'longterm', 'strategy'];

// The Mitra Fund X-Ray on a fund page (#274): the same three findings the page computes, written up in plain words.
export const FUND_XRAY_SPEC: BriefSpec = {
  surface: 'fund',
  minItems: 3,
  toneLabels: DEFAULT_TONES,
  items: [
    { key: 'role', label: 'Role', aliases: ['role', 'profile', 'character', 'type'] },
    { key: 'overlap', label: 'Portfolio fit', aliases: ['overlap', 'fit', 'concentration', 'sector', 'portfolio'] },
    { key: 'cost', label: 'Cost & downside', aliases: ['cost', 'downside', 'expense', 'drawdown', 'fall'] },
  ],
};

export const BRIEF_SPECS: Readonly<Record<BriefSurface, BriefSpec>> = {
  dashboard: DASHBOARD_SPEC,
  market: MARKET_SPEC,
  news: NEWS_SPEC,
  ipo: IPO_SPEC,
  fund: FUND_XRAY_SPEC,
};
