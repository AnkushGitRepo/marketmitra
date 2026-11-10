import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getFileStore } from '@/lib/mitra-chat/gridFsFileStore';
import { parseRange } from '@/lib/mitra-chat/range';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const err = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

/** Owner-only download. Only allow-listed, sniffed types are ever stored, and they're served with nosniff + a sandbox CSP. */
export async function GET(request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return err('Not authenticated', 401);
  const { id } = await params;
  const stored = await getFileStore().read(userId, id);
  if (!stored) return err('File not found', 404);

  const { meta, bytes } = stored;
  const range = parseRange(request.headers.get('range'), bytes.length);
  const headers: Record<string, string> = {
    'Content-Type': meta.mediaType,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
  };

  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${bytes.length}` } });
  }
  if (range) {
    const slice = bytes.subarray(range.start, range.end + 1);
    return new Response(slice as BodyInit, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${bytes.length}`, 'Content-Length': String(slice.length) },
    });
  }
  return new Response(bytes as BodyInit, { status: 200, headers: { ...headers, 'Content-Length': String(bytes.length) } });
}

/** Removes an attachment that was uploaded but never sent. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  if (!userId) return err('Not authenticated', 401);
  const { id } = await params;
  const removed = await getFileStore().remove(userId, id);
  if (!removed) return err('File not found, or already part of a message', 404);
  return NextResponse.json({ success: true, data: { removed: true }, error: null });
}
