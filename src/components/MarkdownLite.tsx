// Thin JSX renderer over `parseMarkdownLite` (Phase 10b). Handles only the
// subset the AI surfaces emit: headings, bullet/numbered lists, pipe tables,
// fenced code, paragraphs, `**bold**` / `*italic*` / `code`. No links, images
// or HTML — everything is rendered as React text, never as markup.

import { Fragment, type ReactNode } from 'react';
import { parseMarkdownLite, type InlineToken } from './markdownLiteParse';

function renderInline(tokens: InlineToken[]): ReactNode[] {
  return tokens.map((tok, i) => {
    if (tok.t === 'strong') return <strong key={i}>{tok.v}</strong>;
    if (tok.t === 'em') return <em key={i}>{tok.v}</em>;
    if (tok.t === 'code') return <code key={i}>{tok.v}</code>;
    return <Fragment key={i}>{tok.v}</Fragment>;
  });
}

export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const blocks = parseMarkdownLite(text);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        if (block.kind === 'ul' || block.kind === 'ol') {
          const List = block.kind;
          return (
            <List key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </List>
          );
        }
        if (block.kind === 'hr') return <hr key={i} />;
        if (block.kind === 'pre') {
          return (
            <pre key={i}>
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.kind === 'table') {
          return (
            <div key={i} data-md-table-scroll style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    {block.head.map((cell, j) => (
                      <th key={j}>{renderInline(cell)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, j) => (
                        <td key={j}>{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const content = renderInline(block.tokens);
        if (block.kind === 'h2') return <h2 key={i}>{content}</h2>;
        if (block.kind === 'h3') return <h3 key={i}>{content}</h3>;
        if (block.kind === 'h4') return <h4 key={i}>{content}</h4>;
        return <p key={i}>{content}</p>;
      })}
    </div>
  );
}
