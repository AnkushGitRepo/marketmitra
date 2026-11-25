// The report as one self-contained, print-ready HTML document (#372): a cover with contents, then the chapters, A4, with a
// faint watermark and a running footer on every page. It does not copy the web page, so none of the page's layout, buttons or
// "writing…" status can leak into the PDF, and it has its own styles and fonts.

import { CHAPTERS, type ReportChapter } from '../chapters';
import { escapeHtml, markdownToHtml } from './html';
import { headlineFigures, reportDateLong, reportFileBase, reportRef, type ExportMeta } from './meta';
import { blockHtml } from './printBlocks';

export const WATERMARK = 'MARKETMITRA RESEARCH · FOR PERSONAL USE';

/** A rupee-capable font stack: the system sans fonts all carry the rupee sign, which a web font subset often lacks. */
const FONT_STACK = "'Segoe UI','Helvetica Neue',Arial,'Noto Sans',sans-serif";

export const PRINT_CSS = `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: ${FONT_STACK}; font-size: 10.5px; line-height: 1.55; color: #16191c; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
/* The page margins come from a repeating header and footer row, so no browser header or footer can print in them. */
table.page { width: 100%; border-collapse: collapse; }
table.page > thead > tr > td > div { height: 15mm; }
table.page > tfoot > tr > td > div { height: 19mm; }
table.page > tbody > tr > td { padding: 0 14mm; vertical-align: top; }
.watermark { position: fixed; top: 44%; left: 6%; width: 88%; text-align: center; transform: rotate(-32deg); font-size: 44px; font-weight: 700; letter-spacing: 0.06em; color: #16191c; opacity: 0.035; pointer-events: none; z-index: 0; }
.running { position: fixed; left: 14mm; right: 14mm; bottom: 8mm; padding-top: 5px; border-top: 0.5px solid #cfc9bb; font-size: 8px; color: #656d72; display: flex; justify-content: space-between; background: #fff; z-index: 2; }

.cover { break-after: page; min-height: 255mm; display: flex; flex-direction: column; }
.letterhead { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #16191c; color: #fbf8f1; border-radius: 8px; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand b { display: block; font-size: 12px; letter-spacing: 0.14em; }
.brand small { display: block; font-size: 8.5px; color: #b9bfc6; }
.ref { text-align: right; font-size: 8.5px; color: #b9bfc6; line-height: 1.5; }
.ref b { display: block; color: #7ee2a8; letter-spacing: 0.08em; font-size: 9px; }
.cover h1 { margin: 26px 0 2px; font-size: 26px; line-height: 1.2; letter-spacing: -0.01em; }
.cover .sub { margin: 0 0 18px; font-size: 11px; color: #606870; }
.cover h3 { margin: 22px 0 8px; font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: #656d72; }
.contents { margin: 0; padding: 0; list-style: none; }
.contents li { display: flex; gap: 10px; padding: 5px 0; border-bottom: 0.5px dotted #cfc9bb; font-size: 11px; }
.contents li span { width: 22px; color: #0b7e63; font-weight: 600; }
.disclaimer { margin-top: auto; padding: 10px 12px; border: 0.5px solid #cfc9bb; border-radius: 6px; background: #faf8f2; font-size: 8.5px; line-height: 1.5; color: #4b5057; }

.chapter { padding-top: 10px; }
.chapter + .chapter { margin-top: 8px; }
.chapter h2 { margin: 0 0 8px; padding-bottom: 5px; border-bottom: 1.5px solid #16191c; font-size: 15px; break-after: avoid; }
.chapter h2 span { color: #0b7e63; margin-right: 6px; }
h4, h4.sub { margin: 12px 0 4px; font-size: 11px; break-after: avoid; }
p { margin: 0 0 8px; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 8px; padding-left: 16px; }
li { margin: 2px 0; }
.failed { padding: 8px 10px; border: 0.5px solid #f3cfc5; background: #fbe9e4; color: #9a3f2b; border-radius: 5px; }
.sources { margin-top: 8px; font-size: 8.5px; color: #656d72; }

.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 0 0 12px; break-inside: avoid; }
.kpi { padding: 8px 10px; border: 0.5px solid #e3dfd4; background: #faf8f2; border-radius: 6px; }
.kl { display: block; font-size: 7.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #656d72; }
.kv { display: block; margin-top: 2px; font-size: 15px; font-weight: 600; }
.kn { display: block; margin-top: 1px; font-size: 8px; color: #606870; }
.kn[data-tone='positive'] { color: #0b8266; } .kn[data-tone='negative'] { color: #ba533c; }

figure { margin: 0 0 12px; }
figcaption { margin: 0 0 4px; font-size: 10.5px; font-weight: 600; break-after: avoid; }
figcaption span { font-weight: 400; color: #656d72; }
.note { margin: 0 0 5px; font-size: 8.5px; color: #656d72; }
figure.chart { break-inside: avoid; }
figure.tbl table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 9px; }
figure.tbl thead { display: table-header-group; }
figure.tbl th, figure.tbl td { padding: 4px 5px; border-bottom: 0.5px solid #e3dfd4; vertical-align: top; overflow-wrap: anywhere; word-break: normal; }
figure.tbl th { background: #faf8f2; font-weight: 600; color: #4b5057; }
figure.tbl tr { break-inside: avoid; }
.l { text-align: left; } .r { text-align: right; font-variant-numeric: tabular-nums; }
td[data-best='true'] { background: #e6f7f1; color: #0b7e63; font-weight: 600; }
table.md { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 9px; margin-bottom: 8px; }
table.md th, table.md td { padding: 3px 5px; border-bottom: 0.5px solid #e3dfd4; text-align: left; overflow-wrap: anywhere; }
.legend { margin: 2px 0 0; font-size: 8.5px; color: #606870; }
.sw { display: inline-block; width: 8px; height: 8px; margin: 0 4px 0 8px; border-radius: 2px; } .sw.line { height: 3px; width: 14px; vertical-align: middle; }
.hbars { display: flex; flex-direction: column; gap: 4px; }
.hrow { display: grid; grid-template-columns: 22% 1fr 14%; gap: 8px; align-items: center; font-size: 8.5px; }
.hl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #606870; } .hv { text-align: right; font-variant-numeric: tabular-nums; }
.track { position: relative; height: 10px; } .track i { position: absolute; top: 1px; height: 8px; border-radius: 2px; } .track b { position: absolute; top: -1px; bottom: -1px; width: 0.5px; background: #cfc9bb; }
.donut { display: flex; align-items: center; gap: 16px; } .donut ul { list-style: none; margin: 0; padding: 0; font-size: 9px; } .donut li { display: flex; gap: 6px; align-items: center; } .donut li b { margin-left: auto; padding-left: 12px; }
.bento { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px; }
.bento section { padding: 8px 10px; border: 0.5px solid #e3dfd4; border-radius: 6px; break-inside: avoid; }
.bento h4 { margin: 0 0 4px; }
`;

const EMBLEM = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><rect width="26" height="26" rx="6" fill="#0d0f12" stroke="#2a2e34"/><polyline points="5,18 10,12 14,15 21,7" fill="none" stroke="#7ee2a8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const chapterHtml = (chapter: ReportChapter, number: number): string => {
  const failed = chapter.status === 'failed' ? `<p class="failed">This chapter could not be written${chapter.note ? `: ${escapeHtml(chapter.note)}` : '.'}${chapter.blocks.length > 0 ? ' The figures above are the stored data.' : ''}</p>` : '';
  const sources = chapter.sources.length > 0 ? `<p class="sources">Sources: ${chapter.sources.map((s) => escapeHtml(s.title)).join('; ')}</p>` : '';
  return `<section class="chapter"><h2><span>${String(number).padStart(2, '0')}</span>${escapeHtml(chapter.title)}</h2>${chapter.blocks.map(blockHtml).join('\n')}${chapter.prose ? markdownToHtml(chapter.prose) : ''}${failed}${sources}</section>`;
};

/** The chapters worth printing (anything with figures, text or a failure to report), in reading order. */
const printable = (chapters: readonly ReportChapter[]): ReportChapter[] =>
  CHAPTERS.flatMap(({ id }) => chapters.filter((c) => c.id === id && (c.blocks.length > 0 || c.prose || c.status === 'failed')));

export function buildReportPrintHtml(chapters: readonly ReportChapter[], meta: ExportMeta): string {
  const shown = printable(chapters);
  const date = reportDateLong(meta.generatedAt);
  const kpis = headlineFigures(chapters);
  const kpiHtml = kpis.length > 0 ? `<div class="kpis">${kpis.map((k) => `<div class="kpi"><span class="kl">${escapeHtml(k.label)}</span><span class="kv">${escapeHtml(k.value)}</span>${k.note ? `<span class="kn">${escapeHtml(k.note)}</span>` : ''}</div>`).join('')}</div>` : '';
  const footer = `MarketMitra Research · ${escapeHtml(meta.name)} (${escapeHtml(meta.symbol)}) · Generated ${date} · Public data synthesis`;
  const cover = `<section class="cover">
<div class="letterhead"><div class="brand">${EMBLEM}<div><b>MARKETMITRA RESEARCH</b><small>Independent company research from public data</small></div></div>
<div class="ref"><b>COMPANY RESEARCH REPORT</b>${escapeHtml(reportRef(meta))}<br>${date}</div></div>
<h1>${escapeHtml(meta.name)}</h1><p class="sub">NSE: ${escapeHtml(meta.symbol)}</p>
${kpiHtml}
<h3>Contents</h3><ol class="contents">${shown.map((c, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span>${escapeHtml(c.title)}</li>`).join('')}</ol>
<div class="disclaimer"><b>About this report.</b> Written by ${escapeHtml(meta.model)} from figures MarketMitra holds (company financials, exchange filings, shareholding, peers) and, where a chapter says so, from web searches. The figures in the cards, charts and tables are computed from that stored data; the written analysis is an AI model’s synthesis and can contain errors, so check anything that matters against the source. This is neutral analysis for information. It is not investment advice, a recommendation or a price target. Scenarios are ranges drawn from the company’s own history, not forecasts.</div>
</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(reportFileBase(meta))}</title><style>${PRINT_CSS}</style></head><body>
<div class="watermark">${WATERMARK}</div>
<div class="running"><span>${footer}</span><span>Not investment advice</span></div>
<table class="page"><thead><tr><td><div></div></td></tr></thead><tbody><tr><td>
${cover}
${shown.map((c, i) => chapterHtml(c, i + 1)).join('\n')}
</td></tr></tbody><tfoot><tr><td><div></div></td></tr></tfoot></table>
</body></html>`;
}
