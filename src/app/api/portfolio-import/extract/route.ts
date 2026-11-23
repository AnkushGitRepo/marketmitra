import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rateLimit';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { parseCsvText, parseXlsxBuffer } from '@/lib/portfolio-import/extractStructured';
import { extractFromDocx, extractFromImage, extractFromPdf } from '@/lib/portfolio-import/extractUnstructured';
import { buildProposedChanges } from '@/lib/portfolio-import/diff';
import type { ExtractedHolding } from '@/lib/portfolio-import/types';

// ADR 0022, part C — file-based portfolio import, extract step. Writes
// nothing: returns a proposed diff for the user to review and (separately,
// explicitly) approve via POST /api/portfolio-import/confirm.
export const dynamic = 'force-dynamic';
// Image/PDF/DOCX extraction is a real AI call on top of the upload itself.
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type FileKind = 'csv' | 'xlsx' | 'docx' | 'pdf' | 'image';

function detectKind(file: File): FileKind | null {
  const name = file.name.toLowerCase();
  const type = file.type;
  if (type === 'text/csv' || name.endsWith('.csv')) return 'csv';
  if (type.includes('spreadsheetml') || name.endsWith('.xlsx')) return 'xlsx';
  if (type.includes('wordprocessingml') || name.endsWith('.docx')) return 'docx';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/')) return 'image';
  return null;
}

function unreadable(message: string) {
  return NextResponse.json({ error: 'unreadable', message }, { status: 422 });
}

async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return unreadable('No file was uploaded.');
  if (file.size === 0) return unreadable('That file is empty.');
  if (file.size > MAX_FILE_BYTES) return unreadable('That file is too large (max 10 MB).');

  if (file.name.toLowerCase().endsWith('.xls')) return unreadable('Old .xls files are not supported. Save it as .xlsx or .csv and upload that.');
  const kind = detectKind(file);
  if (!kind) return unreadable('Unsupported file type. Use an image, CSV, XLSX, DOCX, or PDF.');

  const buffer = Buffer.from(await file.arrayBuffer());
  let holdings: ExtractedHolding[] | null;

  if (kind === 'csv') {
    const outcome = parseCsvText(buffer.toString('utf-8'));
    if (outcome.error) return unreadable(outcome.error);
    holdings = outcome.holdings;
  } else if (kind === 'xlsx') {
    try {
      const outcome = await parseXlsxBuffer(buffer);
      if (outcome.error) return unreadable(outcome.error);
      holdings = outcome.holdings;
    } catch {
      return unreadable('Could not read that XLSX file — it may be corrupted.');
    }
  } else {
    // image / pdf / docx go through the user's own AI key (ADR 0018 §2).
    const aiConfig = await getUserAiConfig(userId);
    if (!aiConfig) {
      return NextResponse.json(
        { error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' },
        { status: 400 }
      );
    }
    const result =
      kind === 'image'
        ? await extractFromImage(aiConfig, buffer, file.type || 'image/png')
        : kind === 'pdf'
          ? await extractFromPdf(aiConfig, buffer)
          : await extractFromDocx(aiConfig, buffer);
    if (!result.ok) return unreadable(result.error);
    holdings = result.holdings;
  }

  if (!holdings || holdings.length === 0) {
    return NextResponse.json(
      { error: 'no_holdings_found', message: "Couldn't find any recognizable holdings in that file." },
      { status: 422 }
    );
  }

  const changes = await buildProposedChanges(userId, holdings);
  return NextResponse.json({ success: true, data: changes });
}

export const POST = withRateLimit(handlePOST, 'ai');
