// Small HTML helpers for the print document. Everything the model or the data wrote is escaped here, never inserted raw.

import { parseMarkdownLite, type InlineToken } from '@/components/markdownLiteParse';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const inline = (tokens: readonly InlineToken[]): string =>
  tokens
    .map((t) => (t.t === 'strong' ? `<strong>${escapeHtml(t.v)}</strong>` : t.t === 'em' ? `<em>${escapeHtml(t.v)}</em>` : t.t === 'code' ? `<code>${escapeHtml(t.v)}</code>` : escapeHtml(t.v)))
    .join('');

/** The model's markdown (the subset the app allows: headings, lists, tables, bold and italic) as escaped HTML. */
export function markdownToHtml(markdown: string): string {
  return parseMarkdownLite(markdown)
    .map((block) => {
      switch (block.kind) {
        case 'h2':
        case 'h3':
        case 'h4':
          // Chapter titles are h2 in the document, so the model's headings sit one level below.
          return `<h4 class="sub">${inline(block.tokens)}</h4>`;
        case 'p':
          return `<p>${inline(block.tokens)}</p>`;
        case 'ul':
          return `<ul>${block.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
        case 'ol':
          return `<ol>${block.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ol>`;
        case 'table':
          return `<table class="md"><thead><tr>${block.head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${block.rows
            .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`;
        case 'pre':
          return `<pre>${escapeHtml(block.text)}</pre>`;
        case 'hr':
          return '<hr />';
      }
    })
    .join('\n');
}
