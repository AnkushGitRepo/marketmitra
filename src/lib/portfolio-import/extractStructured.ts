// Deterministic extraction for XLSX/CSV portfolio exports (ADR 0022,
// part C). No AI call — exact numbers, no cost, and no reliance on a
// model to transcribe figures it could get wrong. Column names vary a lot
// across brokers, so the header row is *detected* by keyword rather than
// assumed to be row 1.

import ExcelJS from 'exceljs';
import { parse as parseCsvSync } from 'csv-parse/sync';
import { isSummaryLabel, mergeDuplicates, normalizeSymbol, parseAmount } from './normalize';
import type { ExtractedHolding } from './types';

// Aliases are matched against the normalized header (lower-case, "." and "_" turned into spaces), in priority order:
// "avg cost" wins over a plain "price" column such as a Closing Price.
const SYMBOL_HEADERS = ['symbol', 'ticker', 'scrip', 'instrument', 'security', 'stock', 'company'];
const QTY_HEADERS = ['net qty', 'quantity', 'qty', 'no of shares', 'shares', 'units', 'holding qty'];
const PRICE_HEADERS = [
  'avg price',
  'average price',
  'buy price',
  'avg cost',
  'average cost',
  'purchase price',
  'buy avg',
  'average',
  'avg',
  'cost',
  'price',
  'rate',
];

const HEADER_SCAN_ROWS = 5;
const CSV_DELIMITERS = [',', ';', '\t'] as const;
const COLUMN_LABELS = { symbol: 'Symbol', qty: 'Quantity', price: 'Avg Price' } as const;

export interface SkippedRow {
  /** 1-based row number in the file, counting the header row. */
  readonly row: number;
  readonly reason: string;
}

export interface ParseOutcome {
  readonly holdings: ExtractedHolding[];
  readonly skippedRows: SkippedRow[];
  readonly warnings: string[];
  /** Column names (Symbol, Quantity, Avg Price) that could not be found. Empty when the header was recognised. */
  readonly missingColumns: string[];
  /** A plain-language reason when no holdings came out; null otherwise. */
  readonly error: string | null;
}

const failure = (error: string, missingColumns: string[] = []): ParseOutcome => ({ holdings: [], skippedRows: [], warnings: [], missingColumns, error });

function normalizeHeader(cell: unknown): string {
  return String(cell ?? '')
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ColumnIndexes {
  symbolCol: number;
  qtyCol: number;
  priceCol: number;
}

/** First column containing the highest-priority alias that appears anywhere in the row. */
function findCol(normalized: readonly string[], aliases: readonly string[]): number {
  for (const alias of aliases) {
    const i = normalized.findIndex((c) => c.includes(alias));
    if (i !== -1) return i;
  }
  return -1;
}

function locateColumns(headerRow: readonly unknown[]): { columns: ColumnIndexes; found: number } {
  const normalized = headerRow.map(normalizeHeader);
  const columns = { symbolCol: findCol(normalized, SYMBOL_HEADERS), qtyCol: findCol(normalized, QTY_HEADERS), priceCol: findCol(normalized, PRICE_HEADERS) };
  return { columns, found: Object.values(columns).filter((i) => i !== -1).length };
}

function missingFrom(columns: ColumnIndexes): string[] {
  return [
    ...(columns.symbolCol === -1 ? [COLUMN_LABELS.symbol] : []),
    ...(columns.qtyCol === -1 ? [COLUMN_LABELS.qty] : []),
    ...(columns.priceCol === -1 ? [COLUMN_LABELS.price] : []),
  ];
}

function missingMessage(missing: readonly string[]): string {
  const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}` : missing[0];
  return `Couldn't find the ${list} column${missing.length > 1 ? 's' : ''}. Expected headers like Symbol, Quantity and Avg Price.`;
}

const isBlank = (row: readonly unknown[]): boolean => row.every((c) => String(c ?? '').trim() === '');

function mergeNotes(rows: readonly ExtractedHolding[]): string[] {
  const counts = new Map<string, number>();
  for (const h of rows) {
    const label = h.rawSymbol ?? h.rawName ?? '';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n > 1).map(([label, n]) => `${label} appeared ${n} times; combined into one holding at the weighted average price.`);
}

/**
 * Maps broker-export rows to holdings. Looks for the header in the first few rows, cleans symbols and rupee
 * strings, skips sold-out and "Total" rows (reporting each), and merges repeated tickers by weighted average
 * cost. Never throws: a file it cannot use comes back with `error` set.
 */
export function parseHoldingRows(rows: readonly (readonly unknown[])[]): ParseOutcome {
  if (rows.every((r) => isBlank(r ?? []))) return failure('That file is empty.');

  let headerIndex = -1;
  let columns: ColumnIndexes | null = null;
  let best: { columns: ColumnIndexes; found: number } | null = null;
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, rows.length); i++) {
    const candidate = locateColumns(rows[i] ?? []);
    if (candidate.found === 3) {
      headerIndex = i;
      columns = candidate.columns;
      break;
    }
    if (candidate.found > (best?.found ?? 0)) best = candidate;
  }
  if (!columns) {
    const missing = best ? missingFrom(best.columns) : Object.values(COLUMN_LABELS);
    return failure(missingMessage(missing), missing);
  }

  const parsed: ExtractedHolding[] = [];
  const skippedRows: SkippedRow[] = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const cells = row ?? [];
    if (isBlank(cells)) return;
    const rowNumber = headerIndex + offset + 2;
    const label = String(cells[columns.symbolCol] ?? '').trim();
    if (!label) return void skippedRows.push({ row: rowNumber, reason: 'No symbol.' });
    if (isSummaryLabel(label)) return void skippedRows.push({ row: rowNumber, reason: 'Summary row ("Total").' });
    const quantity = parseAmount(cells[columns.qtyCol]);
    if (!(quantity > 0)) return void skippedRows.push({ row: rowNumber, reason: `${label}: quantity is zero, negative or missing.` });
    const avgPrice = parseAmount(cells[columns.priceCol]);
    if (!(avgPrice > 0)) return void skippedRows.push({ row: rowNumber, reason: `${label}: average price is zero, negative or missing.` });
    const id = normalizeSymbol(label);
    if (id) parsed.push({ rawSymbol: id.symbol, rawName: id.name, quantity, avgPrice });
  });

  const holdings = mergeDuplicates(parsed);
  if (holdings.length === 0) return { ...failure('No holdings with a quantity and average price above zero were found in that file.'), skippedRows };
  return { holdings, skippedRows, warnings: mergeNotes(parsed), missingColumns: [], error: null };
}

/** Compatibility wrapper: the holdings, or null when the file yielded none. */
export function rowsToHoldings(rows: unknown[][]): ExtractedHolding[] | null {
  const { holdings } = parseHoldingRows(rows);
  return holdings.length > 0 ? holdings : null;
}

/** Unwraps exceljs's richer cell value shapes (formula results, rich text,
 * hyperlinks, dates) down to a plain primitive `rowsToHoldings` can read. */
function cellToPrimitive(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    if ('result' in obj) return cellToPrimitive(obj.result as ExcelJS.CellValue);
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('');
    }
    if ('text' in obj) return obj.text;
    return null;
  }
  return value;
}

export async function parseXlsxBuffer(buffer: Buffer): Promise<ParseOutcome> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return failure('That workbook has no sheets.');

  const rows: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    // `row.values` is 1-indexed — index 0 is always undefined.
    const cells = (row.values as ExcelJS.CellValue[]).slice(1);
    rows.push(cells.map(cellToPrimitive));
  });
  return parseHoldingRows(rows);
}

export async function extractFromXlsx(buffer: Buffer): Promise<ExtractedHolding[] | null> {
  const { holdings } = await parseXlsxBuffer(buffer);
  return holdings.length > 0 ? holdings : null;
}

/** Picks the delimiter that appears most in the first non-empty line, so comma, semicolon and tab exports all work. */
function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  return CSV_DELIMITERS.reduce((best, d) => (first.split(d).length > first.split(best).length ? d : best), CSV_DELIMITERS[0]);
}

export function parseCsvText(raw: string): ParseOutcome {
  const text = raw.replace(/^\uFEFF/, '');
  if (text.trim() === '') return failure('That file is empty.');
  try {
    const rows = parseCsvSync(text, {
      delimiter: detectDelimiter(text),
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
    }) as unknown[][];
    return parseHoldingRows(rows);
  } catch {
    return failure("That file doesn't look like a CSV. Export your holdings as CSV or XLSX from your broker.");
  }
}

export function extractFromCsv(text: string): ExtractedHolding[] | null {
  const { holdings } = parseCsvText(text);
  return holdings.length > 0 ? holdings : null;
}
