// What a research report becomes when it is saved as a note (#355): title, symbols and body.

import { MAX_RESEARCH_BODY, MAX_TICKERS, MAX_TITLE } from '@/lib/notes/limits';

export type SavedSubject =
  | { readonly type: 'company'; readonly symbol: string; readonly name?: string }
  | { readonly type: 'theme'; readonly text: string }
  | { readonly type: 'portfolio' }
  | { readonly type: 'comparison'; readonly symbols: readonly string[]; readonly names?: Readonly<Record<string, string>> };

export interface SuggestedNote {
  readonly title: string;
  readonly symbol: string | null;
  readonly tickers: readonly string[];
}

const dateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

function subjectLabel(subject: SavedSubject): string {
  switch (subject.type) {
    case 'company':
      return subject.name ? `${subject.name} (${subject.symbol})` : subject.symbol;
    case 'theme':
      return subject.text.trim();
    case 'portfolio':
      return 'My portfolio';
    case 'comparison':
      return subject.symbols.join(' vs ');
  }
}

/** The title, main symbol and symbols of the note a report is saved as. The title carries the date so repeat runs are told apart. */
export function suggestNote(subject: SavedSubject, generatedAt: string): SuggestedNote {
  const title = `${subjectLabel(subject)}: research brief, ${dateLabel(generatedAt)}`;
  const tickers =
    subject.type === 'company' ? [subject.symbol] : subject.type === 'comparison' ? [...subject.symbols] : [];
  return {
    title: title.length <= MAX_TITLE ? title : `${title.slice(0, MAX_TITLE - 1).trimEnd()}…`,
    symbol: subject.type === 'company' ? subject.symbol : null,
    tickers: tickers.slice(0, MAX_TICKERS),
  };
}

/** The report text for the note, with a footer saying what it is, within the research note size limit. */
export function noteBody(content: string, model: string, generatedAt: string): string {
  const footer = `\n\n---\n\nAI-generated research brief (${model}), ${dateLabel(generatedAt)}. A synthesis of public data, not investment advice.`;
  return `${content.slice(0, MAX_RESEARCH_BODY - footer.length).trimEnd()}${footer}`;
}
