// The single source of the Advisor disclaimer. Shown on every advisor page,
// gated behind an acknowledgement on first use, and mirrored in the README.
// Bump DISCLAIMER_VERSION when the wording materially changes — a stored
// acknowledgement for an older version no longer counts.
export const DISCLAIMER_VERSION = 1;

export const DISCLAIMER_SHORT =
  'Educational decision-support, not investment advice. No returns are promised or implied. You are responsible for your own decisions.';

export const DISCLAIMER_POINTS = [
  'This is a rules-based, long-term, quality-focused process that helps you organise your own decisions. It is educational decision support, not investment advice.',
  'It does not guarantee or predict returns. Equity investments can lose value, and the stock sleeve may trail a plain index fund.',
  'It never places orders or touches a broker. Every recommendation is a proposal you confirm and execute yourself.',
  'Scraped data can be wrong or stale. Check anything that matters against the company’s own filings.',
  'You are solely responsible for every investment decision you make.',
] as const;
