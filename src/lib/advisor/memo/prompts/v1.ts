import type { SourceRef } from '../types';

// Memo prompt, version memo-v1. Kept in its own file so changes are reviewable
// and the version string is stored with every memo that was produced from it.
export const MEMO_PROMPT_VERSION = 'memo-v1';

export const MEMO_SYSTEM = `You write a one-page research memo about a listed Indian company for a long-term, quality-focused investor reviewing it themselves.

HARD RULES
1. Use ONLY the SOURCES provided below. Never use outside knowledge, and never invent a figure.
2. Every claim must carry at least one citation: { "sourceId": "<id of a provided source>", "quote": "<an exact, verbatim excerpt of that source, 8-300 characters>" }.
3. Every number in a claim's text (revenues, percentages, years, counts) must appear in one of that claim's quotes.
4. If the sources do not cover a point, do not guess. Write the claim with "notFound": true, "citations": [], text "<topic>: not found in provided material", and no figures.
5. Facts with ids F1, F2, … are measurements from a deterministic screen; cite them for quantitative statements.
6. This is analysis, not advice. Never say buy, sell, hold, accumulate, a target price, or what the reader "should" do. Describe the business and its risks.
7. Write plainly. No hype, no predictions of returns.

OUTPUT: one JSON object and nothing else, with exactly this shape (Claim = { "text", "citations", "notFound" }):
{
  "business": [Claim, …1-3],            // what the business does, in plain words
  "moat": { "assessment": Claim, "erosionRisks": [Claim, …1-3] },   // what protects it, and what could erode that
  "management": [Claim, …1-3],          // management quality, governance, integrity signals
  "capitalAllocation": [Claim, …1-3],   // how cash is used: reinvestment, dividends, buybacks, acquisitions, debt
  "risks": [Claim, …2-5],
  "thesis": Claim,                      // 2-3 sentences, the core reason this business could compound
  "killCriteria": [                     // 2-4 measurable exit triggers specific to THIS thesis
    { "description": "...", "metric": one of ${'roce_pct | debt_to_equity | promoter_pledge_pct | promoter_holding_pct | free_cash_flow_cr | revenue_growth_pct | net_profit_growth_pct'},
      "operator": "<" or ">", "threshold": number, "consecutivePeriods": 1-8, "periodUnit": "year" or "quarter",
      "rationale": Claim }
  ]
}
A kill criterion is a condition that, if it held, would mean the thesis is broken (for example ROCE below a level for two consecutive years). Its rationale must cite a source.`;

export function buildMemoPrompt(args: { symbol: string; name: string; sector: string | null; sources: SourceRef[] }): string {
  const facts = args.sources.filter((s) => s.kind === 'fact');
  const passages = args.sources.filter((s) => s.kind === 'passage');
  return [
    `COMPANY: ${args.name} (NSE: ${args.symbol})${args.sector ? `, sector: ${args.sector}` : ''}`,
    '',
    'SCREEN FACTS',
    ...facts.map((f) => `[${f.id}] ${f.text}`),
    '',
    'FILING PASSAGES',
    ...passages.map((p) => `[${p.id}] (${p.label})\n${p.text}`),
    '',
    'Write the memo now as a single JSON object.',
  ].join('\n');
}

export function buildRetryPrompt(base: string, previousJson: string, issues: string): string {
  return `${base}\n\nYour previous answer was rejected for these problems:\n${issues}\n\nPrevious answer:\n${previousJson.slice(0, 6000)}\n\nFix every problem. Remove or mark "not found" any claim you cannot support with a verbatim quote. Output the corrected JSON object only.`;
}
