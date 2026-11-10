// Turns a stored AI portfolio insight into the short "AI Daily Brief" (two sentences). Pure.

const DISCLAIMER = /\s*This is a synthesis of public data, not investment advice\.?\s*$/i;

/** Strips markdown noise (headings, bullets, bold/italics/code) so the brief reads as plain sentences. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// A sentence ends at . ! or ? followed by whitespace, unless the dot belongs to a number ("1.5%"), a rupee amount
// or a common abbreviation, which the lookbehind on a digit and the abbreviation list protect.
const ABBREVIATIONS = /\b(?:Rs|Mr|Mrs|Ms|Dr|vs|etc|approx|No)\.$/i;

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ((ch !== '.' && ch !== '!' && ch !== '?') || !/\s/.test(text[i + 1] ?? ' ')) continue;
    if (ch === '.' && (/\d$/.test(text.slice(start, i)) && /^\s*\d/.test(text.slice(i + 1)) )) continue; // "1. 5" style splits
    const candidate = text.slice(start, i + 1);
    if (ABBREVIATIONS.test(candidate)) continue;
    out.push(candidate.trim());
    start = i + 1;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/** Headings label a section; they are not part of the prose, so they must not be glued onto the first sentence. */
function dropHeadingLines(text: string): string {
  return text.replace(/^\s{0,3}#{1,6}\s+.*$/gm, '');
}

/** The first `count` sentences of an insight, without headings, markdown or the standard closing disclaimer. */
export function briefFromInsight(content: string, count = 2): string {
  const plain = stripMarkdown(dropHeadingLines(content)).replace(DISCLAIMER, '').trim();
  return splitSentences(plain).slice(0, count).join(' ');
}
