// Pure parser for the small markdown subset the AI surfaces emit (research
// briefs, Mitra chat): headings, bullet and numbered lists, pipe tables,
// fenced code, and **bold** / *italic* / `code` inline. No links, images or
// raw HTML, so model output can never inject markup. The JSX renderer lives in
// MarkdownLite.tsx; this is the part worth unit-testing.

export type InlineToken =
  | { t: 'text'; v: string }
  | { t: 'strong'; v: string }
  | { t: 'em'; v: string }
  | { t: 'code'; v: string };

export type Block =
  | { kind: 'h2' | 'h3' | 'h4' | 'p'; tokens: InlineToken[] }
  | { kind: 'ul'; items: InlineToken[][] }
  | { kind: 'ol'; items: InlineToken[][] }
  | { kind: 'table'; head: InlineToken[][]; rows: InlineToken[][][] }
  | { kind: 'pre'; text: string }
  | { kind: 'hr' };

export function parseInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  const re = /(`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ t: 'code', v: m[2] });
    else if (m[3] !== undefined) out.push({ t: 'strong', v: m[3] });
    else out.push({ t: 'em', v: m[4] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

const splitRow = (line: string): string[] => {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.map((c) => c.trim());
};
const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isSeparator = (line: string) => isTableLine(line) && splitRow(line).every((c) => /^:?-{2,}:?$/.test(c));

export function parseMarkdownLite(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: 'p', tokens: parseInline(para.join(' ')) });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map(parseInline);
      blocks.push(list.kind === 'ul' ? { kind: 'ul', items } : { kind: 'ol', items });
      list = null;
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    if (/^\s*```/.test(line)) {
      flushAll();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      blocks.push({ kind: 'pre', text: body.join('\n') });
      continue;
    }

    if (isTableLine(line) && i + 1 < lines.length && isSeparator(lines[i + 1].trimEnd())) {
      flushAll();
      const head = splitRow(line).map(parseInline);
      const rows: InlineToken[][][] = [];
      i += 2;
      while (i < lines.length && isTableLine(lines[i].trimEnd())) rows.push(splitRow(lines[i++]).map(parseInline));
      i -= 1;
      blocks.push({ kind: 'table', head, rows });
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushAll();
      blocks.push({ kind: 'hr' });
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (heading) {
      flushAll();
      const kind = (['h2', 'h2', 'h3', 'h4'] as const)[heading[1].length - 1];
      blocks.push({ kind, tokens: parseInline(heading[2]) });
    } else if (bullet || numbered) {
      flushPara();
      const kind = bullet ? 'ul' : 'ol';
      if (list && list.kind !== kind) flushList();
      list ??= { kind, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (line.trim() === '') {
      flushAll();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushAll();
  return blocks;
}
