import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { isEncKeyConfigured } from '@/lib/crypto';
import { validateAiKey } from '@/lib/ai/generate';
import { clearAiSettings, getAiSettingsView, setAiSettings } from '@/lib/userSettings';

const putSchema = z.object({
  provider: z.enum(['gemini', 'anthropic', 'openrouter']),
  apiKey: z.string().trim().min(10).max(400),
  // Model ids end up in provider request URLs, so allow only id-like characters
  // (letters, digits, . _ : / -) and no path traversal.
  model: z
    .string()
    .trim()
    .max(120)
    .regex(/^[A-Za-z0-9._:/-]*$/, 'Model id contains invalid characters')
    .refine((m) => !m.includes('..'), 'Model id contains invalid characters')
    .optional(),
});

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const view = await getAiSettingsView(userId).catch(() => null);
  return NextResponse.json({ success: true, data: view, meta: { encConfigured: isEncKeyConfigured() } });
}

export async function PUT(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  if (!isEncKeyConfigured()) {
    return NextResponse.json(
      { success: false, error: 'This deployment has no SETTINGS_ENC_KEY set, so keys cannot be stored.' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }
  const { provider, apiKey, model } = parsed.data;

  const check = await validateAiKey({ provider, apiKey, model: model ?? null });
  if (!check.ok) {
    return NextResponse.json({ success: false, error: check.error }, { status: 400 });
  }

  await setAiSettings(userId, { provider, apiKey, model });
  const view = await getAiSettingsView(userId);
  return NextResponse.json({ success: true, data: view });
}

export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  await clearAiSettings(userId);
  return NextResponse.json({ success: true, data: null });
}
