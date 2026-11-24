import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rateLimit';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { AI_PROVIDER_IDS } from '@/lib/ai/providerCatalog';
import { curatedList, listModels } from '@/lib/ai/modelList';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const bodySchema = z.object({
  provider: z.enum(AI_PROVIDER_IDS),
  /** A key typed but not saved yet (setup wizard, Change key). Without it the saved key for the same provider is used. */
  apiKey: z.string().trim().min(1).max(500).optional(),
});

const err = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

/**
 * The models the account can use with a provider (#333): fetched live from the provider's own fixed listing URL with the key, merged
 * with the curated list, grouped Latest / Free / Other by the client. Any failure answers with the curated list, never an error.
 * The key is read here on the server, sent only to the provider, and never returned, logged or echoed.
 */
async function handlePOST(request: Request) {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return err('Not authenticated', 401);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return err('Invalid request', 422);
  const { provider, apiKey } = parsed.data;

  let key = apiKey ?? null;
  if (!key) {
    const saved = await getUserAiConfig(userId).catch(() => null);
    key = saved && saved.provider === provider ? saved.apiKey : null;
  }
  const result = key || provider === 'openrouter' ? await listModels(provider, key, userId) : curatedList(provider);
  return NextResponse.json({ success: true, data: result, error: null });
}

export const POST = withRateLimit(handlePOST, 'ai');
