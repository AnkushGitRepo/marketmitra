import { describe, expect, it } from 'vitest';
import { buildPrintDocument } from './printDocument';

describe('buildPrintDocument', () => {
  it('puts the body in a standalone page with the copied styles and print rules', () => {
    const html = buildPrintDocument({ title: 'My report', headHtml: '<link rel="stylesheet" href="/a.css">', bodyHtml: '<p>Hi</p>' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<link rel="stylesheet" href="/a.css">');
    expect(html).toContain('<body><p>Hi</p></body>');
    expect(html).toContain('@page');
    expect(html).toContain('[data-print-hide]');
  });
  it('escapes the title so it cannot add markup', () => {
    const html = buildPrintDocument({ title: '</title><script>x()</script>', headHtml: '', bodyHtml: '' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;/title&gt;');
  });
});
