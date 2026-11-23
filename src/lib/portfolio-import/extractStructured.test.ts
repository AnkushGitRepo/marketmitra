import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { extractFromCsv, parseCsvText, parseHoldingRows, parseXlsxBuffer, rowsToHoldings } from './extractStructured';

describe('rowsToHoldings', () => {
  it('maps rows under a recognizable header row, splitting symbol vs name', () => {
    const rows = [
      ['Symbol', 'Quantity', 'Avg Price'],
      ['TCS', '10', '3200'],
      ['Tata Consultancy Services', '5', '3300'],
    ];
    expect(rowsToHoldings(rows)).toEqual([
      { rawSymbol: 'TCS', rawName: null, quantity: 10, avgPrice: 3200 },
      { rawSymbol: null, rawName: 'Tata Consultancy Services', quantity: 5, avgPrice: 3300 },
    ]);
  });

  it('finds the header even when it is not the first row', () => {
    const rows = [
      ['My broker export'],
      [],
      ['Scrip', 'Shares', 'Buy Price'],
      ['INFY', '3', '1500'],
    ];
    expect(rowsToHoldings(rows)).toEqual([
      { rawSymbol: 'INFY', rawName: null, quantity: 3, avgPrice: 1500 },
    ]);
  });

  it('recognizes varied header phrasing across columns', () => {
    const rows = [
      ['Stock Name', 'No. of Shares', 'Average Cost'],
      ['HDFC Bank', '20', '1600'],
    ];
    expect(rowsToHoldings(rows)).toEqual([
      { rawSymbol: null, rawName: 'HDFC Bank', quantity: 20, avgPrice: 1600 },
    ]);
  });

  it('skips rows with a missing or non-positive quantity/price', () => {
    const rows = [
      ['Symbol', 'Quantity', 'Avg Price'],
      ['TCS', '0', '3200'],
      ['INFY', '5', ''],
      ['HDFCBANK', '10', '1600'],
    ];
    expect(rowsToHoldings(rows)).toEqual([
      { rawSymbol: 'HDFCBANK', rawName: null, quantity: 10, avgPrice: 1600 },
    ]);
  });

  it('returns null when no header row is recognizable', () => {
    const rows = [
      ['Just', 'some', 'text'],
      ['1', '2', '3'],
    ];
    expect(rowsToHoldings(rows)).toBeNull();
  });

  it('returns null when the header matches but every data row is invalid', () => {
    const rows = [['Symbol', 'Quantity', 'Avg Price']];
    expect(rowsToHoldings(rows)).toBeNull();
  });
});

describe('extractFromCsv', () => {
  it('parses a real CSV string end to end', () => {
    const csv = 'Symbol,Quantity,Avg Price\nRELIANCE,15,2400\nTCS,10,3200\n';
    expect(extractFromCsv(csv)).toEqual([
      { rawSymbol: 'RELIANCE', rawName: null, quantity: 15, avgPrice: 2400 },
      { rawSymbol: 'TCS', rawName: null, quantity: 10, avgPrice: 3200 },
    ]);
  });
});

describe('parseHoldingRows: real broker exports', () => {
  it('reads a Zerodha-style header (Instrument / Qty. / Avg. cost) and ignores the other columns', () => {
    const rows = [
      ['Instrument', 'Qty.', 'Avg. cost', 'LTP', 'Invested', 'Cur. val', 'P&L', 'Net chg.', 'Day chg.'],
      ['RELIANCE', '10', '1,250.50', '1300', '12505', '13000', '495', '3.9%', '0.2%'],
    ];
    expect(parseHoldingRows(rows).holdings).toEqual([{ rawSymbol: 'RELIANCE', rawName: null, quantity: 10, avgPrice: 1250.5 }]);
  });

  it('reads a Groww-style header (Stock Name / Quantity / Buy Price) and prefers Buy Price over Closing Price', () => {
    const rows = [
      ['Stock Name', 'ISIN', 'Quantity', 'Closing Price', 'Buy Price'],
      ['Tata Consultancy Services', 'INE467B01029', '5', '3400', '3,100.25'],
    ];
    expect(parseHoldingRows(rows).holdings).toEqual([{ rawSymbol: null, rawName: 'Tata Consultancy Services', quantity: 5, avgPrice: 3100.25 }]);
  });

  it('cleans exchange suffixes, case and Indian rupee strings in one pass', () => {
    const rows = [
      ['Symbol', 'Net Qty', 'Average'],
      ['RELIANCE-EQ', '1,000', '₹1,25,450.50'],
      ['tcs.ns', '2', 'Rs. 3,200'],
      ['hdfcbank.bo', '3', '1600'],
    ];
    expect(parseHoldingRows(rows).holdings).toEqual([
      { rawSymbol: 'RELIANCE', rawName: null, quantity: 1000, avgPrice: 125450.5 },
      { rawSymbol: 'TCS', rawName: null, quantity: 2, avgPrice: 3200 },
      { rawSymbol: 'HDFCBANK', rawName: null, quantity: 3, avgPrice: 1600 },
    ]);
  });

  it('merges a ticker bought in two tranches by weighted average and says so', () => {
    const rows = [
      ['Symbol', 'Quantity', 'Avg Price'],
      ['INFY', '10', '1400'],
      ['INFY-EQ', '5', '1550'],
    ];
    const out = parseHoldingRows(rows);
    expect(out.holdings).toEqual([{ rawSymbol: 'INFY', rawName: null, quantity: 15, avgPrice: 1450 }]);
    expect(out.warnings).toEqual(['INFY appeared 2 times; combined into one holding at the weighted average price.']);
  });

  it('skips sold-out rows, summary footers and blank rows, and reports each with its row number', () => {
    const rows = [
      ['Symbol', 'Quantity', 'Avg Price'],
      ['TCS', '0', '3200'],
      ['HDFCBANK', '10', '1600'],
      [],
      ['', '', ''],
      ['Total', '10', '16000'],
    ];
    const out = parseHoldingRows(rows);
    expect(out.holdings).toHaveLength(1);
    expect(out.skippedRows.map((s) => s.row)).toEqual([2, 6]);
    expect(out.skippedRows[0].reason).toMatch(/quantity/i);
    expect(out.skippedRows[1].reason).toMatch(/total/i);
  });
});

describe('parseHoldingRows: bad files never throw', () => {
  it('names the missing column when only some headers are found', () => {
    const out = parseHoldingRows([['Symbol', 'Quantity'], ['TCS', '5']]);
    expect(out.holdings).toEqual([]);
    expect(out.missingColumns).toEqual(['Avg Price']);
    expect(out.error).toMatch(/Avg Price/);
  });

  it('names every missing column when no header row is recognisable', () => {
    const out = parseHoldingRows([['foo', 'bar'], ['1', '2']]);
    expect(out.missingColumns).toEqual(['Symbol', 'Quantity', 'Avg Price']);
  });

  it('handles an empty file and a headers-only file', () => {
    expect(parseHoldingRows([]).error).toMatch(/empty/i);
    const headersOnly = parseHoldingRows([['Symbol', 'Quantity', 'Avg Price']]);
    expect(headersOnly.holdings).toEqual([]);
    expect(headersOnly.error).toMatch(/no holdings/i);
  });
});

describe('parseCsvText', () => {
  it('strips a BOM and accepts semicolon- and tab-separated exports', () => {
    expect(parseCsvText('﻿Symbol;Quantity;Avg Price\nTCS;5;3200\n').holdings).toHaveLength(1);
    expect(parseCsvText('Symbol\tQuantity\tAvg Price\nTCS\t5\t3200\n').holdings).toHaveLength(1);
  });

  it('keeps quoted Indian numbers intact', () => {
    const csv = 'Instrument,Qty.,Avg. cost\nRELIANCE-EQ,"1,000","1,250.50"\n';
    expect(parseCsvText(csv).holdings).toEqual([{ rawSymbol: 'RELIANCE', rawName: null, quantity: 1000, avgPrice: 1250.5 }]);
  });

  it('reports an empty CSV and binary junk (a PDF renamed to .csv) as a readable error, not a crash', () => {
    expect(parseCsvText('').error).toMatch(/empty/i);
    const junk = parseCsvText('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\n\x00\x01\x02"unterminated');
    expect(junk.holdings).toEqual([]);
    expect(junk.error).toBeTruthy();
  });
});

describe('parseXlsxBuffer', () => {
  it('reads a Groww-style workbook with numeric and rupee-string cells', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Holdings');
    ws.addRow(['Stock Name', 'Quantity', 'Buy Price']);
    ws.addRow(['RELIANCE', 10, 1250.5]);
    ws.addRow(['infy.ns', '5', '₹1,550']);
    ws.addRow(['INFY', 10, 1400]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const out = await parseXlsxBuffer(buffer);
    expect(out.error).toBeNull();
    expect(out.holdings).toEqual([
      { rawSymbol: 'RELIANCE', rawName: null, quantity: 10, avgPrice: 1250.5 },
      { rawSymbol: 'INFY', rawName: null, quantity: 15, avgPrice: 1450 },
    ]);
  });

  it('reports a workbook with no usable columns instead of crashing', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Sheet1').addRow(['Name', 'Notes']);
    const out = await parseXlsxBuffer(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(out.error).toMatch(/Symbol, Quantity and Avg Price/);
  });
});
