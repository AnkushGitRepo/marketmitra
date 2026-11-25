import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rateLimit';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { generateInsightText } from '@/lib/ai/generate';
import { RESEARCH_STRUCTURED_SYSTEM } from '@/lib/ai/prompts';
import {
  buildResearchPrompt,
  type FactBlock,
  type ResearchSubject,
} from '@/lib/ai/researchPrompts';
import { retrieveInsightGrounding } from '@/lib/rag/insightContext';
import {
  getCompany,
  getFinancials,
  getPrices,
  getRatios,
  getShareholding,
  getPeers,
  searchSymbols,
} from '@/lib/dashboard/fundamentalsApi';
import { resolveSymbol } from '@/lib/research/resolveSymbol';
import { summariseRatios } from '@/lib/research/ratioSummary';
import { themeFacts } from '@/lib/research/themeFacts';
import type { ResearchBlock } from '@/lib/research/blocks';
import { blocksToMarkdown } from '@/lib/research/blocksMarkdown';
import { buildCompanyData, type CompanyData } from '@/lib/research/companyData';
import { companyBlocks } from '@/lib/research/companyBlocks';
import { comparisonBlocks } from '@/lib/research/comparisonBlocks';
import { portfolioBlocks } from '@/lib/research/portfolioBlocks';
import { parseThesis, salvageSummary, thesisBlock } from '@/lib/research/thesis';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Thinking models spend part of the output budget on hidden reasoning, and a cut-off JSON reply loses the thesis (same limit as the other structured briefs). */
const RESEARCH_MAX_TOKENS = 12000;
const MAX_RATIO_HOLDINGS = 15;

const SYMBOL = z.string().trim().min(1).max(40);
const bodySchema = z.object({
  subject: z.discriminatedUnion('type', [
    z.object({ type: z.literal('company'), symbol: SYMBOL }),
    z.object({ type: z.literal('theme'), text: z.string().trim().min(2).max(200) }),
    z.object({ type: z.literal('portfolio') }),
    z.object({ type: z.literal('comparison'), symbols: z.array(SYMBOL).min(2).max(4) }),
  ]),
});

const HEADLINE_LABELS = ['Sales', 'Revenue', 'Net Profit', 'Operating Profit', 'EPS', 'Profit before tax'];

/** Latest + prior for a few headline P&L line items. */
function pivotFinancials(pl: { label: string; period_end: string; value: string | null }[] | null): string {
  const byLabel = new Map<string, { period_end: string; value: string | null }[]>();
  for (const item of pl ?? []) {
    if (!byLabel.has(item.label)) byLabel.set(item.label, []);
    byLabel.get(item.label)!.push(item);
  }
  const rows = HEADLINE_LABELS.filter((l) => byLabel.has(l)).map((l) => {
    const sorted = byLabel.get(l)!.slice().sort((a, b) => b.period_end.localeCompare(a.period_end));
    return `${l}: ${sorted[0]?.value ?? '—'} (prior ${sorted[1]?.value ?? '—'})`;
  });
  return rows.join('; ');
}

/** Gather the structured facts for one company. Shared by `company` and
 *  each member of a `comparison`. */
async function companyFacts(symbol: string): Promise<{ name: string; blocks: FactBlock[]; data: CompanyData } | null> {
  const [company, ratios, pl, shareholding, prices] = await Promise.all([
    getCompany(symbol),
    getRatios(symbol),
    getFinancials(symbol, 'profit_and_loss'),
    getShareholding(symbol),
    getPrices(symbol, '1mo'),
  ]);
  if (!company) return null;

  const blocks: FactBlock[] = [];
  blocks.push({
    heading: `${company.name} (${symbol}) — profile`,
    body: [
      `Sector / industry: ${company.sector ?? '—'} / ${company.industry ?? '—'}`,
      company.about ? `About: ${company.about.slice(0, 700)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const ratioLine = (ratios ?? [])
    .slice(0, 16)
    .map((r) => `${r.name}: ${r.value ?? '—'}${r.unit ? ` ${r.unit}` : ''}`)
    .join('; ');
  if (ratioLine) blocks.push({ heading: 'Valuation & quality ratios', body: ratioLine });

  const fin = pivotFinancials(pl);
  if (fin) blocks.push({ heading: 'Recent financials (latest vs prior period)', body: fin });

  const shByCat = new Map<string, string>();
  for (const s of (shareholding ?? []).slice().sort((a, b) => b.quarter_end.localeCompare(a.quarter_end))) {
    if (!shByCat.has(s.category)) shByCat.set(s.category, s.percentage);
  }
  if (shByCat.size > 0) {
    blocks.push({
      heading: 'Latest shareholding',
      body: [...shByCat].map(([cat, pct]) => `${cat}: ${pct}%`).join(', '),
    });
  }

  const closes = (prices ?? []).filter((p) => p.close !== null).map((p) => Number(p.close));
  if (closes.length > 0) {
    blocks.push({ heading: 'Price', body: `Last close ₹${closes.at(-1)}; ~1-month history available.` });
  }

  const data = buildCompanyData({
    symbol,
    name: company.name,
    ratios,
    profitAndLoss: pl,
    shareholding,
  });
  return { name: company.name, blocks, data };
}

interface Assembled {
  factBlocks: FactBlock[];
  grounding: Awaited<ReturnType<typeof retrieveInsightGrounding>>;
  names?: Record<string, string>;
  /** Cards, charts and tables the page draws from the stored figures. */
  reportBlocks: ResearchBlock[];
}

async function assemble(
  subject: ResearchSubject,
  userId: string
): Promise<Assembled> {
  switch (subject.type) {
    case 'company': {
      const [facts, peers] = await Promise.all([companyFacts(subject.symbol), getPeers(subject.symbol).catch(() => null)]);
      const grounding = await retrieveInsightGrounding({
        query: `${facts?.name ?? subject.symbol} ${subject.symbol} results valuation risks recent developments`,
        userId,
        symbol: subject.symbol,
        docTypes: ['news', 'filing'],
        limit: 8,
      });
      return {
        factBlocks: facts?.blocks ?? [],
        grounding,
        names: facts ? { [subject.symbol]: facts.name } : undefined,
        reportBlocks: facts ? companyBlocks(facts.data, peers) : [],
      };
    }
    case 'theme': {
      const grounding = await retrieveInsightGrounding({
        query: subject.text,
        userId,
        docTypes: ['news', 'filing', 'note'],
        limit: 12,
      });
      const theme = await themeFacts(subject.text).catch(() => ({ factBlocks: [], blocks: [] }));
      return { factBlocks: theme.factBlocks, grounding, reportBlocks: theme.blocks };
    }
    case 'portfolio': {
      const holdings = await getEnrichedHoldings(userId).catch(() => []);
      const ratioLines = await Promise.all(
        holdings.slice(0, MAX_RATIO_HOLDINGS).map((h) => getRatios(h.symbol).then(summariseRatios, () => ''))
      );
      const rows = holdings.map((h, i) => {
        const value = h.ltp != null ? h.ltp * h.quantity : null;
        const pl = value != null ? value - h.avgPrice * h.quantity : null;
        return `- ${h.name} (${h.symbol})${h.sector ? `, ${h.sector}` : ''}: qty ${h.quantity}, avg ₹${h.avgPrice}${
          h.ltp != null ? `, LTP ₹${h.ltp}` : ''
        }${pl != null ? `, unrealised P&L ₹${Math.round(pl)}` : ''}${
          ratioLines[i] ? ` | ${ratioLines[i]}` : ''
        }`;
      });
      const factBlocks: FactBlock[] = holdings.length
        ? [{ heading: `Holdings (${holdings.length})`, body: rows.join('\n') }]
        : [];
      const grounding = await retrieveInsightGrounding({
        query: `portfolio review: ${holdings.map((h) => h.name).join(', ') || 'no holdings'} — news, sector moves`,
        userId,
        docTypes: ['news', 'note'],
        limit: 12,
      });
      return { factBlocks, grounding, reportBlocks: portfolioBlocks(holdings) };
    }
    case 'comparison': {
      const gathered = await Promise.all(subject.symbols.map((s) => companyFacts(s)));
      const factBlocks: FactBlock[] = [];
      const names: Record<string, string> = {};
      subject.symbols.forEach((sym, i) => {
        const g = gathered[i];
        if (!g) {
          factBlocks.push({ heading: `${sym}`, body: 'No data available for this symbol.' });
          return;
        }
        names[sym] = g.name;
        factBlocks.push(...g.blocks.map((b) => ({ heading: `[${sym}] ${b.heading}`, body: b.body })));
      });
      const grounding = await retrieveInsightGrounding({
        query: `compare ${Object.values(names).join(' vs ') || subject.symbols.join(' vs ')} — results, valuation, risks`,
        userId,
        docTypes: ['news', 'filing'],
        limit: 12,
      });
      const compared = gathered.filter((g): g is NonNullable<typeof g> => g !== null).map((g) => g.data);
      return { factBlocks, grounding, names, reportBlocks: comparisonBlocks(compared) };
    }
  }
}

type Subject = z.infer<typeof bodySchema>['subject'];

/** Turns typed aliases and names into NSE symbols; reports the ones that match no listed company. */
async function resolveSubject(subject: Subject): Promise<{ subject: Subject } | { missing: string[] }> {
  if (subject.type !== 'company' && subject.type !== 'comparison') return { subject };
  const typed = subject.type === 'company' ? [subject.symbol] : subject.symbols;
  const resolved = await Promise.all(typed.map((t) => resolveSymbol(t, { getCompany, searchSymbols })));
  const missing = typed.filter((_, i) => resolved[i] === null);
  if (missing.length > 0) return { missing };
  const symbols = resolved.map((r) => r!.symbol);
  return {
    subject: subject.type === 'company' ? { type: 'company', symbol: symbols[0] } : { type: 'comparison', symbols },
  };
}

async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }
  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) {
    return NextResponse.json(
      { success: false, error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' },
      { status: 400 }
    );
  }

  const resolution = await resolveSubject(parsed.data.subject);
  if ('missing' in resolution) {
    return NextResponse.json(
      {
        success: false,
        error: `No listed company matches ${resolution.missing.map((m) => `"${m}"`).join(', ')}. Try the NSE symbol, e.g. BHARTIARTL.`,
      },
      { status: 404 }
    );
  }
  const subject = resolution.subject;
  if (subject.type === 'portfolio') {
    const holdings = await getEnrichedHoldings(userId).catch(() => []);
    if (holdings.length === 0) {
      return NextResponse.json({ success: false, error: 'No holdings to research yet.' }, { status: 400 });
    }
  }

  const { factBlocks, grounding, names, reportBlocks } = await assemble(subject, userId);
  const promptSubject: ResearchSubject =
    subject.type === 'company'
      ? { type: 'company', symbol: subject.symbol, name: names?.[subject.symbol] }
      : subject.type === 'comparison'
        ? { type: 'comparison', symbols: subject.symbols, names }
        : subject;

  const prompt = buildResearchPrompt({ subject: promptSubject, factBlocks, grounding: grounding.passages });
  const gen = await generateInsightText(aiConfig, RESEARCH_STRUCTURED_SYSTEM, prompt, {
    maxOutputTokens: RESEARCH_MAX_TOKENS,
  });
  if (!gen.ok) {
    return NextResponse.json({ success: false, error: gen.error }, { status: 502 });
  }

  // The model returns the prose and the three thesis lists as JSON; a reply that is not that JSON is shown as plain
  // markdown under the cards, so a model that ignores the format still produces a readable report.
  const thesis = parseThesis(gen.text);
  const thesisCard = thesis ? thesisBlock(thesis) : null;
  const summary = thesis ? thesis.summary : (salvageSummary(gen.text) ?? gen.text);
  const blocks = thesisCard ? [...reportBlocks, thesisCard] : reportBlocks;
  const content = [summary, blocksToMarkdown(blocks)].filter(Boolean).join('\n\n');

  return NextResponse.json({
    success: true,
    data: { content, summary, blocks, model: gen.model, generatedAt: new Date().toISOString() },
    meta: { grounded: grounding.passages.length > 0, facts: factBlocks.length, structured: thesis !== null },
  });
}

export const POST = withRateLimit(handlePOST, 'ai');
