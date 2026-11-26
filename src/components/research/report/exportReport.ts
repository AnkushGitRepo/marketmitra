import type { ReportChapter } from '@/lib/research/report/chapters';
import { reportMarkdown } from '@/lib/research/report/export/markdown';
import { reportFileBase, type ExportMeta } from '@/lib/research/report/export/meta';
import { buildReportPrintHtml } from '@/lib/research/report/export/printDoc';
import { reportText } from '@/lib/research/report/export/text';
import { printHtmlDocument } from '@/lib/print/printHtml';

export type ExportFormat = 'pdf' | 'docx' | 'md' | 'txt';

export const EXPORT_FORMATS: readonly { readonly id: ExportFormat; readonly label: string; readonly hint: string }[] = [
  { id: 'pdf', label: 'PDF document', hint: 'Opens print: choose Save as PDF' },
  { id: 'docx', label: 'Word document (.docx)', hint: 'Editable, with headings and tables' },
  { id: 'md', label: 'Markdown (.md)', hint: 'For Obsidian, Notion or Git' },
  { id: 'txt', label: 'Plain text (.txt)', hint: 'No formatting' },
];

/** Hands a file to the browser as a download. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the address is released.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Builds the report in one format and hands it to the browser (a download, or the print dialog for PDF). */
export async function exportReport(format: ExportFormat, chapters: readonly ReportChapter[], meta: ExportMeta): Promise<void> {
  const base = reportFileBase(meta);
  switch (format) {
    case 'pdf':
      printHtmlDocument(buildReportPrintHtml(chapters, meta));
      return;
    case 'docx': {
      // The Word library is large, so it is loaded only when someone asks for a Word file.
      const { reportDocxBlob } = await import('@/lib/research/report/export/docx');
      download(await reportDocxBlob(chapters, meta), `${base}.docx`);
      return;
    }
    case 'md':
      download(new Blob([reportMarkdown(chapters, meta)], { type: 'text/markdown;charset=utf-8' }), `${base}.md`);
      return;
    case 'txt':
      download(new Blob([reportText(chapters, meta)], { type: 'text/plain;charset=utf-8' }), `${base}.txt`);
      return;
  }
}
