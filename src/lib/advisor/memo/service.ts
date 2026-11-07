import { generateInsightText } from '@/lib/ai/generate';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { getDocuments } from '@/lib/dashboard/fundamentalsApi';
import { fetchPdfText } from '@/lib/rag/pdfTextClient';
import { screenSymbol } from '../screen/fetch';
import { DEFAULT_KILL_CRITERIA } from './killDefaults';
import { generateMemo, type MemoRun } from './run';
import { buildFacts, buildPassages } from './sources';
import { saveMemo, type StoredMemo } from './store';

export type CreateMemoOutcome =
  | { ok: true; memo: StoredMemo }
  | { ok: false; status: number; error: string; issues?: Array<{ path: string; message: string }> };

const MAX_PDF_PAGES = 150;

/** Screen → read the latest annual report → write a grounded memo → store it.
 * A memo that fails citation checks is never stored or returned. */
export async function createMemo(
  userId: string,
  symbol: string,
  opts: { allowIneligible: boolean; filingUrl?: string; filingText?: string },
  asOf: string,
): Promise<CreateMemoOutcome> {
  const config = await getUserAiConfig(userId);
  if (!config) return { ok: false, status: 412, error: 'Add an AI key in Settings first.' };

  const screened = await screenSymbol(symbol, asOf);
  if (!screened.ok) return { ok: false, status: 502, error: screened.error };
  if (!screened.result.eligible && !opts.allowIneligible) {
    return {
      ok: false,
      status: 409,
      error: `${symbol} does not clear the quality screen, so no memo was written. Pass allowIneligible to write a research-only memo anyway.`,
    };
  }

  // The filing: text the user pasted, a URL they chose (e.g. the company's own
  // investor-relations site), or the latest annual report on file. BSE's
  // download links are often refused to automated clients, hence the overrides.
  let text: string | null = opts.filingText ?? null;
  let label = 'Filing (supplied by you)';
  if (text === null) {
    let url = opts.filingUrl ?? null;
    if (url === null) {
      const docs = (await getDocuments(symbol)) ?? [];
      const report = docs
        .filter((d) => d.document_type === 'annual_report')
        .sort((a, b) => (b.period_end ?? '').localeCompare(a.period_end ?? ''))[0];
      if (!report) {
        return { ok: false, status: 424, error: `No annual report is on file for ${symbol}. Supply a filing URL or paste its text.` };
      }
      url = report.url;
      label = `Annual report ${report.period_end?.slice(0, 4) ?? ''}`.trim();
    }
    const pdf = await fetchPdfText(url, { maxPages: MAX_PDF_PAGES });
    if (!pdf) {
      return {
        ok: false,
        status: 424,
        error: 'The filing could not be fetched (the host may refuse automated downloads). Supply a different URL or paste the text.',
      };
    }
    text = pdf.text;
  }
  const passages = buildPassages(text, { idPrefix: 'AR1', label });
  if (passages.length === 0) {
    return { ok: false, status: 424, error: 'No readable narrative sections were found in the filing.' };
  }
  const sources = [...buildFacts(screened.result), ...passages];

  const run: MemoRun = await generateMemo({
    symbol,
    name: screened.name,
    sector: screened.sector,
    sources,
    generate: (system, prompt) => generateInsightText(config, system, prompt, { maxOutputTokens: 6000 }),
  });
  if (!run.ok) {
    return {
      ok: false,
      status: run.reason === 'generation_failed' ? 502 : 422,
      error: run.error,
      issues: run.issues,
    };
  }

  const stored = await saveMemo(userId, {
    symbol,
    name: screened.name,
    promptVersion: run.promptVersion,
    model: run.model,
    attempts: run.attempts,
    screen: screened.result,
    screenOverridden: !screened.result.eligible,
    memo: run.memo,
    baselineKillCriteria: DEFAULT_KILL_CRITERIA,
    sources,
  });
  return { ok: true, memo: stored };
}
