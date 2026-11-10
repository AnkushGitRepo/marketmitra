import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdownLite } from './markdownLiteParse';

describe('parseInline', () => {
  it('splits **bold** and *italic* out of surrounding text', () => {
    expect(parseInline('a **b** and *c* here')).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'strong', v: 'b' },
      { t: 'text', v: ' and ' },
      { t: 'em', v: 'c' },
      { t: 'text', v: ' here' },
    ]);
  });
  it('returns plain text unchanged', () => {
    expect(parseInline('nothing special')).toEqual([{ t: 'text', v: 'nothing special' }]);
  });
});

describe('parseMarkdownLite', () => {
  it('parses ## / ### headings', () => {
    const b = parseMarkdownLite('## What it is\n### Sub');
    expect(b.map((x) => x.kind)).toEqual(['h2', 'h3']);
  });

  it('groups consecutive bullets into one ul', () => {
    const b = parseMarkdownLite('- one\n- two\n- three');
    expect(b).toEqual([
      { kind: 'ul', items: [[{ t: 'text', v: 'one' }], [{ t: 'text', v: 'two' }], [{ t: 'text', v: 'three' }]] },
    ]);
  });

  it('joins wrapped lines into a paragraph, splits on a blank line', () => {
    const b = parseMarkdownLite('first line\ncontinued\n\nsecond');
    expect(b).toEqual([
      { kind: 'p', tokens: [{ t: 'text', v: 'first line continued' }] },
      { kind: 'p', tokens: [{ t: 'text', v: 'second' }] },
    ]);
  });

  it('separates a heading and a list that follow a paragraph with no blank line', () => {
    const b = parseMarkdownLite('some text\n## Risks\n- a risk');
    expect(b.map((x) => x.kind)).toEqual(['p', 'h2', 'ul']);
  });

  it('accepts * as a bullet marker too', () => {
    expect(parseMarkdownLite('* starred').map((x) => x.kind)).toEqual(['ul']);
  });
});

describe('parseInline code', () => {
  it('splits `code` spans out of text', () => {
    expect(parseInline('use `P/E` here')).toEqual([
      { t: 'text', v: 'use ' },
      { t: 'code', v: 'P/E' },
      { t: 'text', v: ' here' },
    ]);
  });
});

describe('parseMarkdownLite — chat additions', () => {
  it('parses numbered lists and keeps them separate from bullets', () => {
    const b = parseMarkdownLite('1. one\n2) two\n- bullet');
    expect(b.map((x) => x.kind)).toEqual(['ol', 'ul']);
    expect(b[0].kind === 'ol' && b[0].items).toHaveLength(2);
  });

  it('parses a pipe table with header and rows', () => {
    const b = parseMarkdownLite('| Stock | P/E |\n|---|:--:|\n| TCS | 28 |\n| INFY | 24 |\n\nafter');
    expect(b[0]).toEqual({
      kind: 'table',
      head: [[{ t: 'text', v: 'Stock' }], [{ t: 'text', v: 'P/E' }]],
      rows: [
        [[{ t: 'text', v: 'TCS' }], [{ t: 'text', v: '28' }]],
        [[{ t: 'text', v: 'INFY' }], [{ t: 'text', v: '24' }]],
      ],
    });
    expect(b[1].kind).toBe('p');
  });

  it('does not treat a lone pipe line without a separator row as a table', () => {
    expect(parseMarkdownLite('| a | b |')[0].kind).toBe('p');
  });

  it('parses fenced code verbatim, including markdown-looking lines', () => {
    const b = parseMarkdownLite('```\n## not a heading\n- not a bullet\n```');
    expect(b).toEqual([{ kind: 'pre', text: '## not a heading\n- not a bullet' }]);
  });

  it('treats a single # as a top-level heading and tolerates an unclosed fence', () => {
    expect(parseMarkdownLite('# Title')[0].kind).toBe('h2');
    expect(parseMarkdownLite('```\ncode')[0]).toEqual({ kind: 'pre', text: 'code' });
  });

  it('never produces markup from HTML-looking text', () => {
    const b = parseMarkdownLite('<script>alert(1)</script>');
    expect(b[0]).toEqual({ kind: 'p', tokens: [{ t: 'text', v: '<script>alert(1)</script>' }] });
  });
});

describe('parseMarkdownLite — rules', () => {
  it('parses --- / *** / ___ as a horizontal rule, not a bullet or paragraph', () => {
    for (const rule of ['---', '***', '___', '- - -']) {
      expect(parseMarkdownLite(`above\n\n${rule}\n\nbelow`).map((b) => b.kind)).toEqual(['p', 'hr', 'p']);
    }
  });

  it('still treats a table separator row and a normal bullet correctly', () => {
    expect(parseMarkdownLite('| a |\n|---|\n| 1 |')[0].kind).toBe('table');
    expect(parseMarkdownLite('- item')[0].kind).toBe('ul');
  });
});
