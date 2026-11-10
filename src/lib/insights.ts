import { createHash } from 'node:crypto';
import { getDb } from '@/lib/mongodb';

export type InsightScope = 'stock' | 'portfolio' | 'ipo' | 'market';

export interface Insight {
  content: string;
  model: string;
  generatedAt: Date;
}

interface InsightDoc {
  scope: InsightScope;
  key: string;
  /** null for shared (cross-user) insights — currently only `ipo`. */
  userId: string | null;
  inputHash: string;
  content: string;
  model: string;
  generatedAt: Date;
}

/** Stable sha256 of any JSON-serialisable input snapshot. */
export function hashInput(input: unknown): string {
  return createHash('sha256').update(stableStringify(input)).digest('hex').slice(0, 32);
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

async function collection() {
  const db = await getDb();
  return db.collection<InsightDoc>('insights');
}

function filter(scope: InsightScope, key: string, userId: string | null) {
  return { scope, key, userId };
}

/** The cached insight for a subject, ignoring freshness — for the initial
 * server render. */
export async function getCachedInsight(
  scope: InsightScope,
  key: string,
  userId: string | null
): Promise<Insight | null> {
  const doc = await (await collection()).findOne(filter(scope, key, userId));
  return doc ? { content: doc.content, model: doc.model, generatedAt: doc.generatedAt } : null;
}

export interface GetOrGenerateArgs {
  scope: InsightScope;
  key: string;
  userId: string | null;
  inputHash: string;
  ttlMs: number;
  /** Only called on a cache miss / stale / hash change / `force`. */
  generate: () => Promise<{ content: string; model: string } | { error: string }>;
  force?: boolean;
}

export type GetOrGenerateResult =
  | { ok: true; insight: Insight; cached: boolean }
  | { ok: false; error: string };

export async function getOrGenerate(args: GetOrGenerateArgs): Promise<GetOrGenerateResult> {
  const col = await collection();
  const existing = await col.findOne(filter(args.scope, args.key, args.userId));

  const fresh =
    existing &&
    existing.inputHash === args.inputHash &&
    Date.now() - existing.generatedAt.getTime() < args.ttlMs;

  if (fresh && !args.force) {
    return {
      ok: true,
      cached: true,
      insight: { content: existing.content, model: existing.model, generatedAt: existing.generatedAt },
    };
  }

  const generated = await args.generate();
  if ('error' in generated) return { ok: false, error: generated.error };

  const now = new Date();
  await col.updateOne(
    filter(args.scope, args.key, args.userId),
    {
      $set: {
        inputHash: args.inputHash,
        content: generated.content,
        model: generated.model,
        generatedAt: now,
      },
      $setOnInsert: { scope: args.scope, key: args.key, userId: args.userId },
    },
    { upsert: true }
  );

  return {
    ok: true,
    cached: false,
    insight: { content: generated.content, model: generated.model, generatedAt: now },
  };
}
