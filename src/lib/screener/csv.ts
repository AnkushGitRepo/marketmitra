// CSV export for the screener. Pure — the route handler streams the result.

import { SCREENER_RANGE_FIELDS, type ScreenerResultRow } from '@/lib/dashboard/screenerSchema';

interface CsvColumn {
  header: string;
  value: (row: ScreenerResultRow) => string | number | null;
}

const NUMERIC_COLUMNS: CsvColumn[] = [
  { header: 'Price (INR)', value: (r) => r.current_price },
  ...SCREENER_RANGE_FIELDS.map((field) => ({
    header: field.unit
      ? `${field.label} (${field.unit === '₹ Cr' ? 'INR Cr' : field.unit})`
      : field.label,
    value: (r: ScreenerResultRow) => r[field.key],
  })),
];

export const CSV_COLUMNS: CsvColumn[] = [
  { header: 'Symbol', value: (r) => r.symbol },
  { header: 'Company', value: (r) => r.name },
  { header: 'Sector', value: (r) => r.sector },
  { header: 'Industry', value: (r) => r.industry },
  ...NUMERIC_COLUMNS,
];

const FORMULA_START = /^[=+\-@\t\r]/;

/** Quotes a text cell for CSV and defuses spreadsheet formula injection: a
 * company name beginning with = + - @ would otherwise be evaluated by Excel
 * when the file is opened. Numbers are written bare (a negative number is
 * not text and must stay numeric). */
export function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly ScreenerResultRow[]): string {
  const lines = [CSV_COLUMNS.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(c.value(row))).join(','));
  // CRLF per RFC 4180; Excel-friendly.
  return `${lines.join('\r\n')}\r\n`;
}
