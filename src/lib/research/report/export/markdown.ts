// The report as a Markdown file (#372): YAML front matter, a title, the nine chapters with their tables as GitHub-flavoured
// pipe tables, and the disclaimer. Pure.

import { CHAPTERS, chaptersToMarkdown, type ReportChapter } from '../chapters';
import { headlineFigures, isGroupReport, reportDate, reportRef, subjectInline, type ExportMeta } from './meta';

export const DISCLAIMER_TEXT =
  'This is neutral analysis of public data for information. It is not investment advice, a recommendation or a price target. The figures in tables are computed from stored data; the written analysis is an AI model’s synthesis and can contain errors.';

const NAMED = [
  ['market_cap', /^market cap/i],
  ['pe', /^p\/e/i],
  ['roce', /^roce/i],
  ['fii_holding', /^fii holding/i],
] as const;

/** A YAML double-quoted scalar. JSON string escaping is a subset of YAML's, so a quote or a newline in a name cannot break the header. */
const yaml = (value: string): string => JSON.stringify(value);

export function reportMarkdown(chapters: readonly ReportChapter[], meta: ExportMeta): string {
  const figures = headlineFigures(chapters);
  const named = NAMED.flatMap(([key, pattern]) => {
    const found = figures.find((f) => pattern.test(f.label));
    return found ? [`${key}: ${yaml(found.value)}`] : [];
  });
  const front = [
    '---',
    `title: ${yaml(`${subjectInline(meta)}: ${meta.kind === 'sector' ? 'sector' : meta.kind === 'portfolio' ? 'portfolio' : 'company'} research report`)}`,
    ...(meta.kind === 'portfolio' ? [`portfolio: ${yaml(meta.name)}`] : meta.kind === 'sector' ? [`sector: ${yaml(meta.name)}`] : [`company: ${yaml(meta.name)}`, `ticker: ${yaml(meta.symbol)}`, `exchange: "NSE"`]),
    `date: ${reportDate(meta.generatedAt)}`,
    `generated_at: ${yaml(meta.generatedAt)}`,
    `model: ${yaml(meta.model)}`,
    `report_ref: ${yaml(reportRef(meta))}`,
    ...named,
    `chapters: ${CHAPTERS.filter((c) => chapters.some((r) => r.id === c.id && (r.prose || r.blocks.length > 0))).length}`,
    '---',
  ].join('\n');
  return [front, `# ${isGroupReport(meta) ? meta.name : `${meta.name} (NSE: ${meta.symbol})`}`, `*${DISCLAIMER_TEXT}*`, chaptersToMarkdown(chapters)].filter(Boolean).join('\n\n') + '\n';
}
