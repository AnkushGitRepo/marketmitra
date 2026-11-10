import { DEFAULT_TITLE, TITLE_MAX } from './limits';

/** A readable conversation title from the first user message (no model call). */
export function makeTitle(firstMessage: string): string {
  const flat = firstMessage
    .replace(/[#*_`>~\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return DEFAULT_TITLE;
  if (flat.length <= TITLE_MAX) return flat;
  const cut = flat.slice(0, TITLE_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > TITLE_MAX / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
