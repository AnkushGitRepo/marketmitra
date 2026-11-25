// A standalone page for printing one element (Export PDF). The app shell (sidebar, header) is left out by
// printing the element inside its own frame with the page's styles copied in; the browser's print dialog
// saves it as a PDF.

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PRINT_CSS = `
  body { margin: 0; padding: 24px; background: #fff; color: #16191c; font-family: system-ui, sans-serif; }
  button { pointer-events: none; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  [data-print-hide] { display: none !important; }
  table { page-break-inside: auto; }
  tr, figure, section { page-break-inside: avoid; }
  @page { margin: 14mm; }
`;

export interface PrintDocumentInput {
  readonly title: string;
  /** The page's own `<link rel="stylesheet">` and `<style>` tags, so CSS-module classes look the same. */
  readonly headHtml: string;
  readonly bodyHtml: string;
}

export function buildPrintDocument({ title, headHtml, bodyHtml }: PrintDocumentInput): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${headHtml}<style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`;
}
