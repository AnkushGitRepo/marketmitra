// Turns LaTeX math that a model wrote into readable plain text (#347). The chat renderer draws a small markdown subset with no math, so
// "$[\text{Debt} - \text{Cash}] / \text{Equity}$" would otherwise show as typed. Pure, so it tests without mocks.

// $$...$$, $...$, \(...\) and \[...\]
const MATH_SEGMENT = /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
const HAS_COMMAND = /\\[a-zA-Z]+/;

const SYMBOLS: Readonly<Record<string, string>> = {
  times: '×', cdot: '·', div: '÷', approx: '≈', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', pm: '±', rightarrow: '→', to: '→',
  quad: ' ', qquad: ' ', left: '', right: '', Delta: 'Δ', delta: 'δ', alpha: 'α', beta: 'β', sigma: 'σ', mu: 'μ', infty: '∞',
};
const WRAPPERS = /\\(?:text|textbf|textit|mathrm|mathbf|mathit|operatorname|mbox)\{([^{}]*)\}/g;
const FRAC = /\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g;
const SQRT = /\\sqrt\{([^{}]*)\}/g;
const SUPERSCRIPTS: Readonly<Record<string, string>> = { '2': '²', '3': '³' };

const wrapIfCompound = (s: string): string => (/[\s+\-*/]/.test(s.trim()) ? `(${s.trim()})` : s.trim());

function toPlain(math: string): string {
  let s = math;
  // Innermost first, repeatedly, so nested \frac{\text{a}}{\text{b}} resolves.
  for (let i = 0; i < 5; i += 1) {
    s = s
      .replace(WRAPPERS, '$1')
      .replace(FRAC, (_m, a: string, b: string) => `${wrapIfCompound(a)} / ${wrapIfCompound(b)}`)
      .replace(SQRT, (_m, a: string) => `√(${a})`);
  }
  return s
    .replace(/\\([a-zA-Z]+)/g, (_m, name: string) => SYMBOLS[name] ?? name)
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\([%$&#_{}])/g, '$1')
    .replace(/\^\{?([0-9])\}?/g, (_m, d: string) => SUPERSCRIPTS[d] ?? `^${d}`)
    .replace(/\^\{([^{}]*)\}/g, '^($1)')
    .replace(/_\{([^{}]*)\}/g, '_$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Replaces each math segment that contains a LaTeX command with plain text. A pair of dollar signs with no command between them, such as
 * "$5 and $10", is currency and is left exactly as written.
 */
export function delatex(text: string): string {
  if (!text.includes('\\')) return text;
  return text.replace(MATH_SEGMENT, (match, a?: string, b?: string, c?: string, d?: string) => {
    const inner = a ?? b ?? c ?? d ?? '';
    return HAS_COMMAND.test(inner) ? toPlain(inner) : match;
  });
}
