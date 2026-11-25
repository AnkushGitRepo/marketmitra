// Clean-up for what a model writes (#385): the report is printed and exported, so it must read as plain typography, and a
// numbered list must stay one list.

const REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/\\times/g, 'x'],
  [/\\approx/g, '~'],
  [/\\(?:rightarrow|to)\b/g, '→'],
  [/\\leftarrow/g, '←'],
  [/\\(?:geq?|ge)\b/g, '≥'],
  [/\\(?:leq?|le)\b/g, '≤'],
  [/\\cdot/g, '·'],
  [/\\%/g, '%'],
  [/\\text\{([^}]*)\}/g, '$1'],
  [/\\(?:mathrm|textbf|mathbf)\{([^}]*)\}/g, '$1'],
];

const LATEX_COMMAND = /\\[a-zA-Z]+/;

/** True when what sits between two dollar signs is a math term rather than a price ("P/E", "17.7\times P/E") and not "5 million versus ". */
const isMath = (inner: string): boolean => LATEX_COMMAND.test(inner) || /^[A-Za-z\\]/.test(inner);

const plain = (inner: string): string => REPLACEMENTS.reduce((text, [pattern, to]) => text.replace(pattern, to), inner).replace(/[{}]/g, '');

/** Removes LaTeX the model sometimes writes: `$P/E$` becomes P/E, `\times` becomes x and `\$` becomes a dollar sign. Prices are left alone. */
export function stripMath(text: string): string {
  const ESCAPED = '\u0000';
  return text
    .replace(/\\\$/g, ESCAPED)
    .replace(/\$([^$\n]{1,80})\$/g, (whole, inner: string) => (isMath(inner) ? plain(inner) : whole))
    .replace(new RegExp(ESCAPED, 'g'), '$');
}

const ITEM = /^\s*\d+[.)]\s+(.*\S)\s*$/;

/**
 * A numbered list as one list: items are renumbered 1, 2, 3 in order, and the paragraph the model put under an item joins
 * that item's line. A list a model wrote as separate blocks (so every item restarts at 1) is what this repairs.
 */
export function numberedItems(text: string): string {
  const lines = text.split('\n');
  const before: string[] = [];
  const items: string[] = [];
  for (const line of lines) {
    const item = ITEM.exec(line);
    if (item) items.push(item[1]);
    else if (items.length === 0) before.push(line);
    else if (line.trim()) items[items.length - 1] += ` ${line.trim()}`;
  }
  if (items.length === 0) return text;
  const head = before.join('\n').trim();
  return `${head ? `${head}\n\n` : ''}${items.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
}
