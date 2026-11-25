// The report's charts as self-contained SVG and HTML strings for the print document (#372): inline colours and sizes, so the
// document does not depend on the app's stylesheets. Geometry comes from the same pure helpers the on-screen charts use.

import type { BarChartBlock, DonutChartBlock, FinancialChartBlock } from '../../blocks';
import { barRange, donutArcs, fraction, linePaths, type Point } from '../../chartMath';
import { formatCroreCompact, niceTicks } from '../../financialSeries';
import { formatNumber, formatPercent } from '../../formatters';
import { escapeHtml } from './html';

const INK = '#16191c';
const TEAL = '#17c39a';
const AMBER = '#e3a008';
const MUTED = '#606870';
const GRID = '#e6e2d8';
const LOSS = '#d9917f';
const PALETTE = [INK, TEAL, AMBER, '#40389c', LOSS, '#0b7e63', '#656d72', '#bfb8a8'];
const FONT = "font-family=\"'Segoe UI','Helvetica Neue',Arial,sans-serif\"";

const text = (x: number, y: number, body: string, opts: { size?: number; anchor?: 'start' | 'middle' | 'end'; fill?: string; weight?: number } = {}): string =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${opts.anchor ?? 'middle'}" font-size="${opts.size ?? 11}" fill="${opts.fill ?? MUTED}"${opts.weight ? ` font-weight="${opts.weight}"` : ''} ${FONT}>${escapeHtml(body)}</text>`;

const signed = (v: number | null): string => (v === null ? '' : `${v >= 0 ? '+' : '−'}${formatNumber(Math.abs(v), 1)}% YoY`);
const label = (v: number | null): string => formatNumber(v, v !== null && Number.isInteger(v) ? 0 : 1);

/** Sales and operating profit by fiscal year, with the margin line on a right-hand axis. */
export function financialChartSvg(block: FinancialChartBlock): string {
  const W = 900;
  const H = 330;
  const pad = { top: 26, right: 54, bottom: 52, left: 62 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const periods = block.periods;
  const valueTicks = niceTicks(Math.max(0, ...periods.flatMap((p) => [p.sales ?? 0, p.operatingProfit ?? 0])));
  const marginTicks = niceTicks(Math.max(0, ...periods.map((p) => p.opm ?? 0)), valueTicks.length - 1);
  const yv = (v: number) => pad.top + (1 - v / valueTicks[valueTicks.length - 1]) * innerH;
  const ym = (v: number) => pad.top + (1 - v / marginTicks[marginTicks.length - 1]) * innerH;
  const band = innerW / Math.max(periods.length, 1);
  const barW = Math.min(58, band * 0.4);
  const cx = (i: number) => pad.left + band * i + band / 2;

  const parts: string[] = [];
  for (const t of valueTicks) {
    parts.push(`<line x1="${pad.left}" x2="${W - pad.right}" y1="${yv(t).toFixed(1)}" y2="${yv(t).toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`);
    parts.push(text(pad.left - 8, yv(t) + 4, formatCroreCompact(t).replace(' Cr', ''), { anchor: 'end', size: 10 }));
  }
  for (const t of marginTicks) parts.push(text(W - pad.right + 8, ym(t) + 4, `${t}%`, { anchor: 'start', size: 10, fill: '#8a4b12' }));
  periods.forEach((p, i) => {
    const x = cx(i);
    if (p.sales !== null) parts.push(`<rect x="${(x - barW - 1).toFixed(1)}" y="${yv(p.sales).toFixed(1)}" width="${barW}" height="${(yv(0) - yv(p.sales)).toFixed(1)}" rx="3" fill="${INK}"/>`);
    if (p.operatingProfit !== null) parts.push(`<rect x="${(x + 1).toFixed(1)}" y="${yv(p.operatingProfit).toFixed(1)}" width="${barW}" height="${Math.max(yv(0) - yv(p.operatingProfit), 0).toFixed(1)}" rx="3" fill="${TEAL}"/>`);
    if (p.sales !== null) parts.push(text(x - barW / 2 - 1, yv(p.sales) - 5, formatCroreCompact(p.sales), { size: 9.5 }));
    if (p.operatingProfit !== null) parts.push(text(x + barW / 2 + 1, yv(p.operatingProfit) - 5, formatCroreCompact(p.operatingProfit), { size: 9.5 }));
    if (p.sales === null && p.operatingProfit === null) parts.push(text(x, yv(0) - 10, 'no data', { size: 10 }));
    parts.push(text(x, H - 28, p.label, { size: 12, fill: INK, weight: 600 }));
    parts.push(text(x, H - 10, signed(p.salesGrowth), { size: 10, fill: p.salesGrowth !== null && p.salesGrowth < 0 ? '#ba533c' : '#0b8266' }));
  });
  const points: (Point | null)[] = periods.map((p, i) => (p.opm === null ? null : ([cx(i), ym(p.opm)] as const)));
  for (const d of linePaths(points)) parts.push(`<path d="${d}" fill="none" stroke="${AMBER}" stroke-width="2.5" stroke-linejoin="round"/>`);
  points.forEach((pt, i) => {
    if (!pt) return;
    parts.push(`<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="4" fill="#fff" stroke="${AMBER}" stroke-width="2"/>`);
    parts.push(text(pt[0], pt[1] - 9, formatPercent(periods[i].opm), { size: 9.5, fill: '#8a4b12', weight: 600 }));
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(block.title)}">${parts.join('')}</svg>
<p class="legend"><span class="sw" style="background:${INK}"></span>Sales <span class="sw" style="background:${TEAL}"></span>Operating profit <span class="sw line" style="background:${AMBER}"></span>OPM % (right axis)</p>`;
}

/** A vertical grouped bar chart as SVG, or horizontal bars as HTML rows. */
export function barChartHtml(block: BarChartBlock): string {
  const range = barRange(block.series.map((s) => s.values));
  const legend = block.series.length > 1 ? `<p class="legend">${block.series.map((s, i) => `<span class="sw" style="background:${PALETTE[i % PALETTE.length]}"></span>${escapeHtml(s.name)}`).join(' ')}</p>` : '';

  if (block.orientation === 'horizontal') {
    const zero = fraction(0, range) * 100;
    const rows = block.categories
      .map((cat, row) => {
        const bars = block.series
          .map((s, si) => {
            const v = s.values[row] ?? null;
            if (v === null) return '';
            const at = fraction(v, range) * 100;
            return `<i style="left:${Math.min(at, zero).toFixed(1)}%;width:${Math.max(Math.abs(at - zero), 0.6).toFixed(1)}%;background:${v < 0 ? LOSS : PALETTE[si === 0 ? 1 : si % PALETTE.length]}"></i>`;
          })
          .join('');
        const values = block.series.map((s) => label(s.values[row] ?? null)).join(' / ');
        return `<div class="hrow"><span class="hl">${escapeHtml(cat)}</span><span class="track"><b style="left:${zero.toFixed(1)}%"></b>${bars}</span><span class="hv">${escapeHtml(values)}</span></div>`;
      })
      .join('');
    return `${legend}<div class="hbars">${rows}</div>`;
  }

  const W = 900;
  const H = 260;
  const pad = { top: 22, right: 8, bottom: 28, left: 8 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const y = (v: number) => pad.top + (1 - fraction(v, range)) * innerH;
  const band = innerW / Math.max(block.categories.length, 1);
  const barW = Math.min(44, (band * 0.7) / Math.max(block.series.length, 1));
  const parts = [`<line x1="${pad.left}" x2="${W - pad.right}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="${GRID}"/>`];
  block.categories.forEach((cat, ci) => {
    const x0 = pad.left + band * ci + (band - barW * block.series.length) / 2;
    block.series.forEach((s, si) => {
      const v = s.values[ci] ?? null;
      if (v === null) return;
      const fill = PALETTE[(si === 0 && block.series.length === 1 ? 1 : si) % PALETTE.length];
      parts.push(`<rect x="${(x0 + si * barW).toFixed(1)}" y="${Math.min(y(v), y(0)).toFixed(1)}" width="${barW - 2}" height="${Math.max(Math.abs(y(v) - y(0)), 1).toFixed(1)}" rx="3" fill="${fill}"/>`);
      parts.push(text(x0 + si * barW + (barW - 2) / 2, v < 0 ? y(v) + 12 : Math.min(y(v), y(0)) - 5, label(v), { size: 10 }));
    });
    parts.push(text(pad.left + band * ci + band / 2, H - 8, cat, { size: 11 }));
  });
  return `${legend}<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(block.title)}">${parts.join('')}</svg>`;
}

export function donutHtml(block: DonutChartBlock): string {
  const arcs = donutArcs(block.slices);
  if (arcs.length === 0) return '';
  const circles = arcs
    .map((arc, i) => {
      const len = Math.max(arc.share * 100 - 0.6, 0.1);
      return `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="6" stroke-dasharray="${len.toFixed(2)} ${(100 - len).toFixed(2)}" stroke-dashoffset="${(25 - arc.start * 100).toFixed(2)}"/>`;
    })
    .join('');
  const legend = arcs
    .map((arc, i) => `<li><span class="sw" style="background:${PALETTE[i % PALETTE.length]}"></span>${escapeHtml(arc.label)}<b>${formatNumber(arc.share * 100)}%</b></li>`)
    .join('');
  return `<div class="donut"><svg viewBox="0 0 42 42" width="130" height="130" role="img" aria-label="${escapeHtml(block.title)}">${circles}</svg><ul>${legend}</ul></div>`;
}
