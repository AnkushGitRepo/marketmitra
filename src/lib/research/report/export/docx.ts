// The report as a Word document (#372): real Heading styles (so Word's navigation pane works), tables for the figures, a header
// and a "Page X of Y" footer. Charts are written as the tables of figures behind them. Pure apart from the `docx` library.

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
} from 'docx';
import { parseMarkdownLite, type InlineToken } from '@/components/markdownLiteParse';
import type { DataTableBlock, ResearchBlock } from '../../blocks';
import { formatCell } from '../../formatters';
import { topSources } from '../sources';
import { CHAPTERS, type ReportChapter } from '../chapters';
import { chartAsTable, type PlainTable } from './chartTables';
import { DISCLAIMER_TEXT } from './markdown';
import { headlineFigures, reportDateLong, reportRef, withoutHeadline, subjectInline, subjectTag, type ExportMeta } from './meta';
import { columnWidths } from './printBlocks';

const FONT = 'Calibri';
const BODY_SIZE = 21; // half-points: 10.5 pt
const PAGE = { width: 11906, height: 16838 }; // A4 in twentieths of a point
const MARGIN = 1000;
const CONTENT_WIDTH = PAGE.width - 2 * MARGIN;
const INK = '16191C';
const MUTED = '606870';
const RULE_COLOUR = 'CFC9BB';
const HEAD_FILL = 'FAF8F2';
const BEST_FILL = 'E6F7F1';
const BULLETS = 'bullets';

const runs = (tokens: readonly InlineToken[]): TextRun[] =>
  tokens.map((t) => new TextRun({ text: t.v, bold: t.t === 'strong', italics: t.t === 'em', font: t.t === 'code' ? 'Consolas' : undefined }));

const para = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string; after?: number } = {}): Paragraph =>
  new Paragraph({ spacing: { after: opts.after ?? 100 }, children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size, color: opts.color })] });

const thin = { style: BorderStyle.SINGLE, size: 4, color: RULE_COLOUR } as const;
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;

function cell(text: string, widthDxa: number, opts: { header?: boolean; right?: boolean; fill?: string; bold?: boolean } = {}): TableCell {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
    borders: { top: none, left: none, right: none, bottom: thin },
    shading: opts.header || opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill ?? HEAD_FILL, color: 'auto' } : undefined,
    children: [new Paragraph({ alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text, bold: opts.header || opts.bold, size: 18, color: opts.header ? '4B5057' : INK })] })],
  });
}

function table(headers: readonly string[], rows: readonly (readonly string[])[], percents: readonly number[], rightFrom: number, best: ReadonlySet<string> = new Set()): Table {
  const dxa = percents.map((p) => Math.round((p / 100) * CONTENT_WIDTH));
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: dxa,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, dxa[i], { header: true, right: i >= rightFrom })) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((text, i) => cell(text, dxa[i], { right: i >= rightFrom, fill: best.has(`${ri}:${i}`) ? BEST_FILL : undefined, bold: best.has(`${ri}:${i}`) })) })),
    ],
  });
}

function dataTable(block: DataTableBlock): FileChild[] {
  const firstNumeric = block.columns.findIndex((c, i) => i > 0 && c.format !== 'text');
  const best = new Set<string>();
  block.columns.forEach((c, ci) => {
    if (!c.best) return;
    const values = block.rows.map((r) => r[c.key]);
    const numbers = values.filter((v): v is number => typeof v === 'number');
    if (numbers.length < 2) return;
    const target = c.best === 'high' ? Math.max(...numbers) : Math.min(...numbers);
    values.forEach((v, ri) => v === target && best.add(`${ri}:${ci}`));
  });
  return [
    para(block.title, { bold: true, after: 40 }),
    ...(block.note ? [para(block.note, { italics: true, size: 17, color: MUTED, after: 60 })] : []),
    table(block.columns.map((c) => c.label), block.rows.map((r) => block.columns.map((c) => formatCell(r[c.key] ?? null, c.format))), columnWidths(block), firstNumeric === -1 ? block.columns.length : firstNumeric, best),
    para('', { after: 120 }),
  ];
}

const LABEL_SHARE = 22;

function plainTable(t: PlainTable): FileChild[] {
  const others = Math.max(t.headers.length - 1, 1);
  const widths = t.headers.map((_, i) => (i === 0 ? LABEL_SHARE : (100 - LABEL_SHARE) / others));
  return [para(t.title, { bold: true, after: 40 }), table(t.headers, t.rows, widths, t.numericFrom), para('', { after: 120 })];
}

function blockChildren(block: ResearchBlock): FileChild[] {
  const chart = chartAsTable(block);
  if (chart) return plainTable(chart);
  switch (block.type) {
    case 'kpi_grid':
      return [
        table(['Measure', 'Value'], block.items.map((i) => [i.label, i.note ? `${i.value}  (${i.note})` : i.value]), [30, 70], 1),
        para('', { after: 120 }),
      ];
    case 'data_table':
      return dataTable(block);
    case 'thesis_bento':
      return block.columns.flatMap((c) => [para(c.title, { bold: true, after: 40 }), ...c.items.map((i) => new Paragraph({ numbering: { reference: BULLETS, level: 0 }, spacing: { after: 40 }, children: [new TextRun(i)] }))]);
    case 'card_grid':
      return [
        para(block.title, { bold: true, after: 60 }),
        ...block.cards.map(
          (c, i) =>
            new Paragraph({
              spacing: { after: 70 },
              children: [
                new TextRun({ text: `${block.numbered ? `${String(i + 1).padStart(2, '0')}  ` : ''}${c.heading}`, bold: true }),
                ...(c.tag ? [new TextRun({ text: `  (${c.tag})`, color: MUTED, size: 17 })] : []),
                ...(c.text ? [new TextRun({ text: `  ${c.text}` })] : []),
              ],
            })
        ),
      ];
    default:
      return [];
  }
}

export function proseChildren(markdown: string): FileChild[] {
  return parseMarkdownLite(markdown).flatMap((b): FileChild[] => {
    switch (b.kind) {
      case 'h2':
      case 'h3':
      case 'h4':
        return [new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 60 }, children: runs(b.tokens) })];
      case 'p':
        return [new Paragraph({ spacing: { after: 100 }, children: runs(b.tokens) })];
      case 'ul':
        return b.items.map((i) => new Paragraph({ numbering: { reference: BULLETS, level: 0 }, spacing: { after: 50 }, children: runs(i) }));
      case 'ol':
        return b.items.map((i, n) => new Paragraph({ indent: { left: 540, hanging: 300 }, spacing: { after: 50 }, children: [new TextRun(`${n + 1}.  `), ...runs(i)] }));
      case 'table': {
        const percents = b.head.map(() => 100 / b.head.length);
        const text = (cells: readonly (readonly InlineToken[])[]) => cells.map((c) => c.map((t) => t.v).join(''));
        return [table(text(b.head), b.rows.map(text), percents, b.head.length), para('', { after: 100 })];
      }
      case 'pre':
        return [new Paragraph({ children: [new TextRun({ text: b.text, font: 'Consolas', size: 18 })] })];
      case 'hr':
        return [para('')];
    }
  });
}

const DOC_STYLES = {
  default: { document: { run: { font: FONT, size: BODY_SIZE, color: INK } } },
  paragraphStyles: [
    { id: 'Title', name: 'Title', basedOn: 'Normal', run: { font: FONT, size: 44, bold: true }, paragraph: { spacing: { after: 60 } } },
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 30, bold: true }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 23, bold: true }, paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 1 } },
  ],
};
const DOC_NUMBERING = { config: [{ reference: BULLETS, levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] }] };

export function buildReportDocx(chapters: readonly ReportChapter[], meta: ExportMeta): Document {
  const shown = CHAPTERS.flatMap(({ id }) => withoutHeadline(chapters).filter((c) => c.id === id && (c.blocks.length > 0 || c.prose || c.status === 'failed')));
  const figures = headlineFigures(chapters);
  const front: FileChild[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 60 }, children: [new TextRun({ text: meta.name, bold: true, size: 44, color: INK })] }),
    para(`${subjectTag(meta)}   |   ${reportRef(meta)}   |   ${reportDateLong(meta.generatedAt)}   |   written by ${meta.model}`, { color: MUTED, size: 18, after: 160 }),
    ...(figures.length > 0 ? [table(['Measure', 'Value'], figures.map((f) => [f.label, f.note ? `${f.value}  (${f.note})` : f.value]), [30, 70], 1), para('', { after: 120 })] : []),
    para('Contents', { bold: true, after: 60 }),
    ...shown.map((c, i) => para(`${String(i + 1).padStart(2, '0')}   ${c.title}`, { after: 30 })),
    para('', { after: 120 }),
    para(DISCLAIMER_TEXT, { italics: true, size: 17, color: MUTED }),
    para('Charts are in the PDF and on the web page; the figures behind each chart are in the tables below.', { italics: true, size: 17, color: MUTED }),
  ];
  const body = shown.flatMap((c, i): FileChild[] => [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: i === 0, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: `${String(i + 1).padStart(2, '0')}  ${c.title}`, bold: true, size: 30, color: INK })] }),
    ...c.blocks.flatMap(blockChildren),
    ...(c.prose ? proseChildren(c.prose) : []),
    ...(c.status === 'failed' ? [para(`This chapter could not be written${c.note ? `: ${c.note}` : '.'}`, { italics: true, color: 'B4413C' })] : []),
    ...(c.sources.length > 0 ? [para(`Sources: ${topSources(c.sources).map((s) => s.title).join('; ')}`, { size: 17, color: MUTED })] : []),
  ]);

  return new Document({
    creator: 'MarketMitra Research',
    title: `${subjectInline(meta)}: ${meta.kind === 'sector' ? 'sector' : meta.kind === 'portfolio' ? 'portfolio' : meta.kind === 'compare' ? 'head-to-head' : 'company'} research report`,
    description: DISCLAIMER_TEXT,
    styles: DOC_STYLES,
    numbering: DOC_NUMBERING,
    sections: [
      {
        properties: { page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
        headers: { default: new Header({ children: [new Paragraph({ border: { bottom: thin }, children: [new TextRun({ text: `MarketMitra Research   |   ${subjectInline(meta)}`, size: 16, color: MUTED })] })] }) },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Generated ', size: 16, color: MUTED }), new TextRun({ text: `${reportDateLong(meta.generatedAt)}   |   Public data synthesis, not investment advice   |   Page `, size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED }), new TextRun({ text: ' of ', size: 16, color: MUTED }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: MUTED })],
              }),
            ],
          }),
        },
        children: [...front, ...body],
      },
    ],
  });
}

export const reportDocxBlob = (chapters: readonly ReportChapter[], meta: ExportMeta): Promise<Blob> => Packer.toBlob(buildReportDocx(chapters, meta));
export const reportDocxBytes = (chapters: readonly ReportChapter[], meta: ExportMeta): Promise<Uint8Array> => Packer.toBuffer(buildReportDocx(chapters, meta));

export interface NoteDocxInput {
  readonly title: string;
  readonly body: string;
  /** The tickers the note is about. */
  readonly tickers: readonly string[];
  /** A short line under the title, such as "Saved research, 25 Nov 2026". */
  readonly byline: string;
}

/** A note (a markdown body) as a Word document: its title, a line about it, then the text with real headings, lists and tables. */
export function buildNoteDocx(note: NoteDocxInput): Document {
  const about = [note.byline, ...(note.tickers.length > 0 ? [note.tickers.join(', ')] : [])].join('   |   ');
  return new Document({
    creator: 'MarketMitra',
    title: note.title,
    styles: DOC_STYLES,
    numbering: DOC_NUMBERING,
    sections: [
      {
        properties: { page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
        headers: { default: new Header({ children: [new Paragraph({ border: { bottom: thin }, children: [new TextRun({ text: 'MarketMitra notes', size: 16, color: MUTED })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Page ', size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED })] })] }) },
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 60 }, children: [new TextRun({ text: note.title, bold: true, size: 44, color: INK })] }),
          para(about, { color: MUTED, size: 18, after: 160 }),
          ...proseChildren(note.body),
        ],
      },
    ],
  });
}

export const noteDocxBlob = (note: NoteDocxInput): Promise<Blob> => Packer.toBlob(buildNoteDocx(note));
